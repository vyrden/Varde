import {
  assertChannelId,
  assertGuildId,
  assertUserId,
  type DiscordService,
} from '@varde/contracts';
import type { CoreConfigService } from '@varde/core';
import {
  renderTemplate,
  renderWelcomeCard,
  type WelcomeConfig,
  welcomeConfigSchema,
} from '@varde/module-welcome';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Options d'enregistrement des routes du module welcome.
 */
export interface RegisterWelcomeRoutesOptions {
  readonly discord: DiscordClient;
  readonly discordService?: DiscordService;
  readonly config: CoreConfigService;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const previewBodySchema = z.object({
  backgroundColor: z.string().regex(HEX),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(120),
  avatarUrl: z.string().url().optional(),
});

const testWelcomeBodySchema = z.object({
  /** Brouillon de config envoyé depuis l'éditeur (peut différer du persisté). */
  draft: z.unknown(),
});

/**
 * Route `POST /guilds/:guildId/modules/welcome/preview-card`
 *
 * Génère une carte d'accueil PNG avec les paramètres du body. Pas
 * d'effet de bord côté Discord — le PNG est renvoyé tel quel pour
 * affichage live dans l'éditeur dashboard.
 *
 * Route `POST /guilds/:guildId/modules/welcome/test-welcome`
 *
 * Simule un memberJoin avec l'admin connecté comme nouveau membre.
 * Utilise le brouillon de config envoyé (pas la version persistée),
 * ce qui permet de tester avant de sauvegarder.
 */
export function registerWelcomeRoutes(
  app: FastifyInstance,
  options: RegisterWelcomeRoutesOptions,
): void {
  // -------------------------------------------------------------------------
  // POST /guilds/:guildId/modules/welcome/preview-card
  // -------------------------------------------------------------------------
  app.post<{ Params: { guildId: string } }>(
    '/guilds/:guildId/modules/welcome/preview-card',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      const parseResult = previewBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ reason: 'body-invalide', details: parseResult.error.issues });
      }

      const body = parseResult.data;
      try {
        const png = await renderWelcomeCard({
          title: body.title,
          subtitle: body.subtitle,
          avatarUrl: body.avatarUrl ?? '',
          backgroundColor: body.backgroundColor,
        });
        return reply.code(200).header('content-type', 'image/png').send(png);
      } catch (error) {
        request.log.warn({ err: error }, 'welcome: renderWelcomeCard a échoué');
        return reply
          .code(500)
          .send({ reason: 'render-failed', detail: error instanceof Error ? error.message : '' });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /guilds/:guildId/modules/welcome/test-welcome
  // -------------------------------------------------------------------------
  app.post<{ Params: { guildId: string } }>(
    '/guilds/:guildId/modules/welcome/test-welcome',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      const session = await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.discordService) {
        return reply.code(503).send({ reason: 'service-indisponible' });
      }

      const parseBody = testWelcomeBodySchema.safeParse(request.body);
      if (!parseBody.success) {
        return reply.code(400).send({ reason: 'body-invalide' });
      }
      const draftParse = welcomeConfigSchema.safeParse(parseBody.data.draft);
      if (!draftParse.success) {
        return reply.code(400).send({ reason: 'draft-invalide', details: draftParse.error.issues });
      }

      const draft: WelcomeConfig = draftParse.data;
      if (!draft.welcome.enabled) {
        return reply.code(400).send({ reason: 'welcome-désactivé' });
      }
      if (draft.welcome.destination !== 'dm' && draft.welcome.channelId === null) {
        return reply.code(400).send({ reason: 'channel-requis' });
      }

      const typedGuildId = assertGuildId(guildId);
      const typedUserId = assertUserId(session.userId);

      const userInfo = await options.discordService.getUserDisplayInfo(typedUserId);
      const guildName = options.discordService.getGuildName(typedGuildId) ?? guildId;
      const memberCount = options.discordService.getMemberCount(typedGuildId) ?? 0;
      const username = userInfo?.username ?? 'Admin';
      const tag = userInfo?.tag ?? username;

      const content = renderTemplate(draft.welcome.message, {
        user: username,
        userMention: `<@${session.userId}>`,
        userTag: tag,
        guild: guildName,
        memberCount,
        accountAgeDays: 365,
      });

      const files: { name: string; data: Buffer }[] = [];
      if (draft.welcome.card.enabled) {
        try {
          const png = await renderWelcomeCard({
            title: `Bienvenue, ${tag} !`,
            subtitle: `Tu es le ${memberCount}ᵉ membre`,
            avatarUrl: userInfo?.avatarUrl ?? '',
            backgroundColor: draft.welcome.card.backgroundColor,
          });
          files.push({ name: 'welcome-card.png', data: png });
        } catch (error) {
          request.log.warn({ err: error }, 'welcome: renderWelcomeCard a échoué (test)');
        }
      }

      let embeds: unknown[] | undefined;
      if (draft.welcome.embed.enabled) {
        const colorInt = Number.parseInt(draft.welcome.embed.color.slice(1), 16);
        embeds = [
          {
            description: `[TEST] ${content}`,
            color: Number.isFinite(colorInt) ? colorInt : 0x5865f2,
            ...(files.length > 0 ? { image: { url: 'attachment://welcome-card.png' } } : {}),
          },
        ];
      }

      const sendContent = embeds !== undefined ? '' : `[TEST] ${content}`;
      const fileOpts =
        files.length > 0 || embeds !== undefined
          ? {
              ...(files.length > 0 ? { files } : {}),
              ...(embeds !== undefined ? { embeds } : {}),
            }
          : undefined;

      try {
        if (draft.welcome.destination !== 'dm' && draft.welcome.channelId !== null) {
          await options.discordService.postMessage(
            assertChannelId(draft.welcome.channelId),
            sendContent,
            fileOpts,
          );
        }
        if (draft.welcome.destination !== 'channel') {
          await options.discordService.sendDirectMessage(typedUserId, sendContent, fileOpts);
        }
      } catch (error) {
        request.log.warn({ err: error }, 'welcome: test-welcome a échoué');
        return reply
          .code(502)
          .send({ reason: 'send-failed', detail: error instanceof Error ? error.message : '' });
      }

      return reply.code(200).send({ ok: true });
    },
  );
}
