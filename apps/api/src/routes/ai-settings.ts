import {
  type AIProvider,
  AIProviderError,
  createOllamaProvider,
  createOpenAICompatibleProvider,
  createStubProvider,
  type ProviderInfo,
} from '@varde/ai';
import type { GuildId, KeystoreService, UserId } from '@varde/contracts';
import type { CoreConfigService } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Routes paramétrage IA (ADR 0007, PR 3.9).
 *
 * L'admin d'une guild configure ici le provider IA que l'onboarding
 * utilisera (`generatePreset`, `suggestCompletion`). Trois
 * providers reconnus en V1 :
 *
 * - `none`    — aucun provider. Le stub rule-based sert de fallback
 *   runtime, aucune config n'est requise.
 * - `ollama`  — adapter `@varde/ai/ollama`, auto-hébergé. Requiert
 *   `endpoint` (URL base) + `model`. Pas d'apiKey.
 * - `openai-compat` — OpenAI / OpenRouter / Groq / vLLM / LM Studio
 *   via le dialecte `/chat/completions`. Requiert `endpoint` (base
 *   URL v1) + `model` + `apiKey`. La clé est chiffrée dans le
 *   keystore scopé `core.ai`.
 *
 * Stockage :
 * - Non-sensible (providerId, endpoint, model) → `guild_config`
 *   scope `core.ai`.
 * - apiKey → `keystore` scope `core.ai`, clé `providerApiKey`.
 *
 * V1 par-guild (ADR 0007). Per-instance mutualisé viendra post-V1
 * si le besoin se confirme.
 */

// ─── Shapes wire ──────────────────────────────────────────────────

const PROVIDER_IDS = ['none', 'ollama', 'openai-compat'] as const;
export type AiProviderId = (typeof PROVIDER_IDS)[number];

const putBodySchema = z.discriminatedUnion('providerId', [
  z.object({ providerId: z.literal('none') }),
  z.object({
    providerId: z.literal('ollama'),
    endpoint: z.string().url(),
    model: z.string().min(1).max(128),
  }),
  z.object({
    providerId: z.literal('openai-compat'),
    endpoint: z.string().url(),
    model: z.string().min(1).max(128),
    /** Clé optionnelle en PUT : absente = conserver la précédente. */
    apiKey: z.string().min(1).max(512).optional(),
  }),
]);

const testBodySchema = putBodySchema;

export interface AiSettingsDto {
  readonly providerId: AiProviderId;
  readonly endpoint: string | null;
  readonly model: string | null;
  readonly hasApiKey: boolean;
  readonly updatedAt: string | null;
}

export interface AiTestResultDto extends ProviderInfo {
  readonly providerId: AiProviderId;
}

// ─── Helpers ──────────────────────────────────────────────────────

const KEYSTORE_API_KEY_SLOT = 'providerApiKey';

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

interface ExtractedAiConfig {
  providerId?: AiProviderId;
  endpoint?: string;
  model?: string;
  updatedAt?: string;
}

const extractAiConfig = (snapshot: unknown): ExtractedAiConfig => {
  if (typeof snapshot !== 'object' || snapshot === null) return {};
  const core = (snapshot as { core?: unknown }).core;
  if (typeof core !== 'object' || core === null) return {};
  const ai = (core as { ai?: unknown }).ai;
  if (typeof ai !== 'object' || ai === null) return {};
  const obj = ai as Record<string, unknown>;
  const result: ExtractedAiConfig = {};
  const pid = obj['providerId'];
  if (typeof pid === 'string' && (PROVIDER_IDS as readonly string[]).includes(pid)) {
    result.providerId = pid as AiProviderId;
  }
  if (typeof obj['endpoint'] === 'string') result.endpoint = obj['endpoint'];
  if (typeof obj['model'] === 'string') result.model = obj['model'];
  if (typeof obj['updatedAt'] === 'string') result.updatedAt = obj['updatedAt'];
  return result;
};

const buildProvider = (
  body: z.infer<typeof testBodySchema>,
  apiKey: string | null,
  fetchImpl: typeof globalThis.fetch,
): AIProvider => {
  if (body.providerId === 'none') {
    return createStubProvider();
  }
  if (body.providerId === 'ollama') {
    return createOllamaProvider({ endpoint: body.endpoint, model: body.model, fetch: fetchImpl });
  }
  // openai-compat
  const key = body.apiKey ?? apiKey;
  if (key === null || key.length === 0) {
    throw httpError(
      400,
      'missing_api_key',
      'openai-compat nécessite une apiKey (body ou stockée dans le keystore).',
    );
  }
  return createOpenAICompatibleProvider({
    baseUrl: body.endpoint,
    model: body.model,
    apiKey: key,
    fetch: fetchImpl,
  });
};

// ─── Options ──────────────────────────────────────────────────────

export interface RegisterAiSettingsRoutesOptions {
  readonly config: CoreConfigService;
  /** KeystoreService déjà scopé `core.ai`. */
  readonly keystore: KeystoreService;
  readonly discord: DiscordClient;
  /** Fetch injectable (tests). Défaut : `globalThis.fetch`. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

// ─── Registration ─────────────────────────────────────────────────

export function registerAiSettingsRoutes(
  app: FastifyInstance,
  options: RegisterAiSettingsRoutesOptions,
): void {
  const { config, keystore, discord } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  // GET /guilds/:guildId/settings/ai — lecture (apiKey masquée)
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/settings/ai',
    async (request): Promise<AiSettingsDto> => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, discord);

      let snapshot: unknown = {};
      try {
        snapshot = await config.get(guildId as GuildId);
      } catch {
        snapshot = {};
      }
      const extracted = extractAiConfig(snapshot);
      const providerId: AiProviderId = extracted.providerId ?? 'none';
      const storedKey =
        providerId === 'openai-compat'
          ? await keystore.get(guildId as GuildId, KEYSTORE_API_KEY_SLOT)
          : null;
      return {
        providerId,
        endpoint: extracted.endpoint ?? null,
        model: extracted.model ?? null,
        hasApiKey: storedKey !== null && storedKey.length > 0,
        updatedAt: extracted.updatedAt ?? null,
      };
    },
  );

  // PUT /guilds/:guildId/settings/ai — écriture. N'essaie pas de
  // tester la connexion : utilise POST /test séparément.
  app.put<{ Params: { guildId: string }; Body: unknown }>(
    '/guilds/:guildId/settings/ai',
    async (request, reply) => {
      const { guildId } = request.params;
      const session = await requireGuildAdmin(app, request, guildId, discord);

      const parsed = putBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }

      const body = parsed.data;
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { core: { ai: {} } };

      if (body.providerId === 'none') {
        patch['core'] = {
          ai: {
            providerId: 'none',
            endpoint: null,
            model: null,
            updatedAt: now,
          },
        };
        // On supprime la clé stockée pour ne pas laisser de crédential
        // orphelin lié à un provider inactif.
        await keystore.delete(guildId as GuildId, KEYSTORE_API_KEY_SLOT);
      } else if (body.providerId === 'ollama') {
        patch['core'] = {
          ai: {
            providerId: 'ollama',
            endpoint: body.endpoint,
            model: body.model,
            updatedAt: now,
          },
        };
        await keystore.delete(guildId as GuildId, KEYSTORE_API_KEY_SLOT);
      } else {
        patch['core'] = {
          ai: {
            providerId: 'openai-compat',
            endpoint: body.endpoint,
            model: body.model,
            updatedAt: now,
          },
        };
        if (body.apiKey !== undefined) {
          await keystore.put(guildId as GuildId, KEYSTORE_API_KEY_SLOT, body.apiKey);
        } else {
          // Admin sauvegarde openai-compat sans fournir de clé et
          // rien n'est déjà stocké : on refuse pour éviter la
          // configuration bancale.
          const existing = await keystore.get(guildId as GuildId, KEYSTORE_API_KEY_SLOT);
          if (existing === null) {
            throw httpError(
              400,
              'missing_api_key',
              'openai-compat : apiKey requise en première configuration.',
            );
          }
        }
      }

      await config.setWith(guildId as GuildId, patch, {
        scope: 'core.ai',
        updatedBy: session.userId as UserId,
      });

      void reply.status(204).send();
    },
  );

  // POST /guilds/:guildId/settings/ai/test — test connexion avec
  // un body ad-hoc. Si openai-compat sans apiKey, retombe sur la
  // clé stockée.
  app.post<{ Params: { guildId: string }; Body: unknown }>(
    '/guilds/:guildId/settings/ai/test',
    async (request): Promise<AiTestResultDto> => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, discord);

      const parsed = testBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }

      const body = parsed.data;
      const storedKey =
        body.providerId === 'openai-compat'
          ? await keystore.get(guildId as GuildId, KEYSTORE_API_KEY_SLOT)
          : null;

      let provider: AIProvider;
      try {
        provider = buildProvider(body, storedKey, fetchImpl);
      } catch (err) {
        if (err instanceof AIProviderError) {
          throw httpError(400, 'provider_build_failed', err.message, { code: err.code });
        }
        throw err;
      }

      const info = await provider.testConnection();
      return { ...info, providerId: body.providerId };
    },
  );
}
