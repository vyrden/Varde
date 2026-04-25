import {
  assertChannelId,
  assertGuildId,
  assertUserId,
  type DiscordService,
  type GuildId,
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
import {
  type WelcomeBackgroundTarget,
  WelcomeUploadError,
  type WelcomeUploadsService,
} from '../welcome-uploads.js';

/**
 * Options d'enregistrement des routes du module welcome.
 */
export interface RegisterWelcomeRoutesOptions {
  readonly discord: DiscordClient;
  readonly discordService?: DiscordService;
  readonly config: CoreConfigService;
  /**
   * Service de persistance des images de fond. Absent → les routes
   * upload/delete/get répondent 503.
   */
  readonly uploads?: WelcomeUploadsService;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const previewBodySchema = z.object({
  backgroundColor: z.string().regex(HEX),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(120),
  avatarUrl: z.string().url().optional(),
  /**
   * Cible facultative — quand fournie, on tente de charger l'image
   * de fond persistée pour cette cible et on l'utilise au rendu.
   */
  backgroundTarget: z.enum(['welcome', 'goodbye']).optional(),
});

const backgroundQuerySchema = z.object({
  target: z.enum(['welcome', 'goodbye']),
});

const uploadBodySchema = z.object({
  /** dataURL `data:image/<png|jpeg|webp>;base64,...`. */
  dataUrl: z.string().min(1),
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

      // Tente de récupérer le chemin d'image de fond persistée pour
      // cette cible (si demandé).
      let backgroundImagePath: string | undefined;
      if (body.backgroundTarget !== undefined) {
        backgroundImagePath = await resolvePersistedBackgroundPath(
          options.config,
          assertGuildId(guildId),
          body.backgroundTarget,
          options.uploads,
        );
      }

      try {
        const png = await renderWelcomeCard({
          title: body.title,
          subtitle: body.subtitle,
          avatarUrl: body.avatarUrl ?? '',
          backgroundColor: body.backgroundColor,
          ...(backgroundImagePath !== undefined ? { backgroundImagePath } : {}),
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
  // POST /guilds/:guildId/modules/welcome/background?target=welcome|goodbye
  // -------------------------------------------------------------------------
  app.post<{ Params: { guildId: string }; Querystring: { target?: string } }>(
    '/guilds/:guildId/modules/welcome/background',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.uploads) {
        return reply.code(503).send({ reason: 'uploads-indisponible' });
      }

      const queryParse = backgroundQuerySchema.safeParse(request.query);
      if (!queryParse.success) {
        return reply.code(400).send({ reason: 'target-invalide' });
      }
      const target = queryParse.data.target;

      const bodyParse = uploadBodySchema.safeParse(request.body);
      if (!bodyParse.success) {
        return reply.code(400).send({ reason: 'body-invalide' });
      }

      try {
        const saved = await options.uploads.save(guildId, target, bodyParse.data.dataUrl);
        await patchBackgroundPath(
          options.config,
          assertGuildId(guildId),
          target,
          saved.relativePath,
        );
        return reply.code(200).send({ ok: true, relativePath: saved.relativePath });
      } catch (error) {
        if (error instanceof WelcomeUploadError) {
          return reply.code(400).send({ reason: error.reason, detail: error.message });
        }
        request.log.warn({ err: error }, 'welcome: upload background a échoué');
        return reply.code(500).send({
          reason: 'unknown',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /guilds/:guildId/modules/welcome/background?target=welcome|goodbye
  // -------------------------------------------------------------------------
  app.delete<{ Params: { guildId: string }; Querystring: { target?: string } }>(
    '/guilds/:guildId/modules/welcome/background',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.uploads) {
        return reply.code(503).send({ reason: 'uploads-indisponible' });
      }

      const queryParse = backgroundQuerySchema.safeParse(request.query);
      if (!queryParse.success) {
        return reply.code(400).send({ reason: 'target-invalide' });
      }
      const target = queryParse.data.target;

      await options.uploads.delete(guildId, target);
      await patchBackgroundPath(options.config, assertGuildId(guildId), target, null);
      return reply.code(204).send();
    },
  );

  // -------------------------------------------------------------------------
  // GET /guilds/:guildId/modules/welcome/background?target=welcome|goodbye
  // -------------------------------------------------------------------------
  app.get<{ Params: { guildId: string }; Querystring: { target?: string } }>(
    '/guilds/:guildId/modules/welcome/background',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.uploads) {
        return reply.code(503).send({ reason: 'uploads-indisponible' });
      }

      const queryParse = backgroundQuerySchema.safeParse(request.query);
      if (!queryParse.success) {
        return reply.code(400).send({ reason: 'target-invalide' });
      }
      const target = queryParse.data.target;

      const path = await readBackgroundPath(options.config, assertGuildId(guildId), target);
      if (path === null) {
        return reply.code(404).send({ reason: 'no-background' });
      }
      const file = await options.uploads.read(path);
      if (file === null) {
        return reply.code(404).send({ reason: 'file-missing' });
      }
      return reply.code(200).header('content-type', file.mime).send(file.bytes);
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
        const backgroundImagePath =
          draft.welcome.card.backgroundImagePath !== null && options.uploads !== undefined
            ? options.uploads.resolveAbsolute(draft.welcome.card.backgroundImagePath)
            : undefined;
        try {
          const png = await renderWelcomeCard({
            title: `Bienvenue, ${tag} !`,
            subtitle: `Tu es le ${memberCount}ᵉ membre`,
            avatarUrl: userInfo?.avatarUrl ?? '',
            backgroundColor: draft.welcome.card.backgroundColor,
            ...(backgroundImagePath !== undefined ? { backgroundImagePath } : {}),
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

// ─── Helpers : lecture/écriture du chemin d'image dans la config ───

/**
 * Lit le `backgroundImagePath` actuellement persisté pour la cible.
 * Retourne `null` si absent ou config malformée.
 */
const readBackgroundPath = async (
  config: CoreConfigService,
  guildId: GuildId,
  target: WelcomeBackgroundTarget,
): Promise<string | null> => {
  let snapshot: unknown;
  try {
    snapshot = await config.get(guildId);
  } catch {
    return null;
  }
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const modules = (snapshot as { modules?: unknown }).modules;
  if (typeof modules !== 'object' || modules === null) return null;
  const welcome = (modules as Record<string, unknown>)['welcome'];
  if (typeof welcome !== 'object' || welcome === null) return null;
  const block = (welcome as Record<string, unknown>)[target];
  if (typeof block !== 'object' || block === null) return null;
  const card = (block as { card?: unknown }).card;
  if (typeof card !== 'object' || card === null) return null;
  const path = (card as { backgroundImagePath?: unknown }).backgroundImagePath;
  return typeof path === 'string' && path.length > 0 ? path : null;
};

/** Patche `welcome.<target>.card.backgroundImagePath` dans la config (deep merge). */
const patchBackgroundPath = async (
  config: CoreConfigService,
  guildId: GuildId,
  target: WelcomeBackgroundTarget,
  relativePath: string | null,
): Promise<void> => {
  await config.set(guildId, {
    modules: {
      welcome: {
        [target]: {
          card: {
            backgroundImagePath: relativePath,
          },
        },
      },
    },
  });
};

/**
 * Combine `readBackgroundPath` + `resolveAbsolute` pour obtenir le
 * chemin disque exploitable par le renderer. Retourne `undefined` si
 * pas d'image persistée ou service uploads absent.
 */
const resolvePersistedBackgroundPath = async (
  config: CoreConfigService,
  guildId: GuildId,
  target: WelcomeBackgroundTarget,
  uploads: WelcomeUploadsService | undefined,
): Promise<string | undefined> => {
  if (uploads === undefined) return undefined;
  const relative = await readBackgroundPath(config, guildId, target);
  return relative === null ? undefined : uploads.resolveAbsolute(relative);
};
