import type { GuildId, UserId } from '@varde/contracts';
import type { CoreConfigService } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Routes paramètres globaux du bot par guild.
 *
 * Réutilise l'infra `guild_config` (scope `core.bot-settings`) — pas
 * de table dédiée. Trois réglages exposés en V1 :
 *
 * - `language` — langue par défaut des messages produits par les
 *   modules. Liste fermée alignée sur les locales i18n supportées.
 * - `timezone` — IANA timezone (`Europe/Paris`, `America/New_York`…)
 *   utilisée par scheduler / welcome delays / affichage audit.
 * - `embedColor` — couleur hex de la barre latérale des embeds
 *   produits par les modules (logs, welcome, RR…). Format `#RRGGBB`.
 *
 * Les réglages MEE6-spécifiques (préfixe textuel, toggle commandes
 * slash, monetize) ne sont pas exposés — Varde est slash-only et
 * sans monétisation.
 */

// ─── Shapes wire ──────────────────────────────────────────────────

export const BOT_LANGUAGES = ['en', 'fr', 'es', 'de'] as const;
export type BotLanguage = (typeof BOT_LANGUAGES)[number];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** Subset IANA timezones — ~30 zones majeures plus UTC. */
export const BOT_TIMEZONES = [
  'UTC',
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Lisbon',
  'Europe/Athens',
  'Europe/Moscow',
  'Africa/Casablanca',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Honolulu',
] as const;
export type BotTimezone = (typeof BOT_TIMEZONES)[number];

const putBodySchema = z.object({
  language: z.enum(BOT_LANGUAGES),
  timezone: z.enum(BOT_TIMEZONES),
  embedColor: z.string().regex(HEX_COLOR_RE, 'embedColor doit être un hex #RRGGBB'),
});

export interface BotSettingsDto {
  readonly language: BotLanguage;
  readonly timezone: BotTimezone;
  readonly embedColor: string;
  readonly updatedAt: string | null;
}

const DEFAULT_SETTINGS: BotSettingsDto = {
  language: 'en',
  timezone: 'UTC',
  embedColor: '#5865F2',
  updatedAt: null,
};

// ─── Helpers ──────────────────────────────────────────────────────

const httpError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Error & { statusCode: number; code: string; details?: unknown } => {
  const err = new Error(message) as Error & {
    statusCode: number;
    code: string;
    details?: unknown;
  };
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
};

interface ExtractedBotSettings {
  language?: BotLanguage;
  timezone?: BotTimezone;
  embedColor?: string;
  updatedAt?: string;
}

const extractSettings = (snapshot: unknown): ExtractedBotSettings => {
  if (typeof snapshot !== 'object' || snapshot === null) return {};
  const core = (snapshot as { core?: unknown }).core;
  if (typeof core !== 'object' || core === null) return {};
  const slot = (core as { 'bot-settings'?: unknown })['bot-settings'];
  if (typeof slot !== 'object' || slot === null) return {};
  const obj = slot as Record<string, unknown>;
  const result: ExtractedBotSettings = {};
  const lang = obj['language'];
  if (typeof lang === 'string' && (BOT_LANGUAGES as readonly string[]).includes(lang)) {
    result.language = lang as BotLanguage;
  }
  const tz = obj['timezone'];
  if (typeof tz === 'string' && (BOT_TIMEZONES as readonly string[]).includes(tz)) {
    result.timezone = tz as BotTimezone;
  }
  const color = obj['embedColor'];
  if (typeof color === 'string' && HEX_COLOR_RE.test(color)) {
    result.embedColor = color;
  }
  if (typeof obj['updatedAt'] === 'string') result.updatedAt = obj['updatedAt'];
  return result;
};

// ─── Options ──────────────────────────────────────────────────────

export interface RegisterBotSettingsRoutesOptions {
  readonly config: CoreConfigService;
  readonly discord: DiscordClient;
}

// ─── Registration ─────────────────────────────────────────────────

export function registerBotSettingsRoutes(
  app: FastifyInstance,
  options: RegisterBotSettingsRoutesOptions,
): void {
  const { config, discord } = options;

  // GET /guilds/:guildId/settings/bot
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/settings/bot',
    async (request): Promise<BotSettingsDto> => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, discord);

      let snapshot: unknown = {};
      try {
        snapshot = await config.get(guildId as GuildId);
      } catch {
        snapshot = {};
      }
      const extracted = extractSettings(snapshot);
      return {
        language: extracted.language ?? DEFAULT_SETTINGS.language,
        timezone: extracted.timezone ?? DEFAULT_SETTINGS.timezone,
        embedColor: extracted.embedColor ?? DEFAULT_SETTINGS.embedColor,
        updatedAt: extracted.updatedAt ?? null,
      };
    },
  );

  // PUT /guilds/:guildId/settings/bot
  app.put<{ Params: { guildId: string }; Body: unknown }>(
    '/guilds/:guildId/settings/bot',
    async (request, reply) => {
      const { guildId } = request.params;
      const session = await requireGuildAdmin(app, request, guildId, discord);

      const parsed = putBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }

      const body = parsed.data;
      const now = new Date().toISOString();
      // CoreConfigService merge profond — on passe le sous-arbre
      // complet pour `core.bot-settings`, les autres scopes (core.ai,
      // modules.*) ne sont pas touchés.
      const patch = {
        core: {
          'bot-settings': {
            language: body.language,
            timezone: body.timezone,
            embedColor: body.embedColor,
            updatedAt: now,
          },
        },
      };

      await config.setWith(guildId as GuildId, patch, {
        scope: 'core.bot-settings',
        updatedBy: session.userId as UserId,
      });

      void reply.status(204).send();
    },
  );
}
