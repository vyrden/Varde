import type { DiscordService } from '@varde/contracts';
import { assertChannelId, DiscordSendError } from '@varde/contracts';
import { getBrokenRoutesFor, replayBrokenRouteFor } from '@varde/module-logs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Options d'enregistrement des routes du module logs.
 */
export interface RegisterLogsRoutesOptions {
  /** Client Discord OAuth2 (vérification des permissions admin). */
  readonly discord: DiscordClient;
  /**
   * Service Discord proactif (envoi d'embeds). Requis pour la route
   * POST /test-route. Si absent, la route retourne 503.
   */
  readonly discordService?: DiscordService;
}

/**
 * Route : GET /guilds/:guildId/modules/logs/broken-routes
 *
 * Retourne la liste des routes Discord cassées pour une guild donnée.
 * Une route est cassée quand un `DiscordSendError` a été levé lors de
 * la tentative d'envoi d'embed — les events sont alors bufferisés en RAM.
 *
 * Accès restreint : MANAGE_GUILD Discord requis via `requireGuildAdmin`.
 */
export function registerLogsRoutes(app: FastifyInstance, options: RegisterLogsRoutesOptions): void {
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/modules/logs/broken-routes',
    async (request) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      const routes = getBrokenRoutesFor(guildId).map((r) => ({
        routeId: r.routeId,
        channelId: r.channelId,
        droppedCount: r.droppedCount,
        bufferedCount: r.bufferedCount,
        markedAt: r.markedAt !== null ? new Date(r.markedAt).toISOString() : null,
        reason: r.reason,
      }));

      return { routes };
    },
  );

  /**
   * Route : POST /guilds/:guildId/modules/logs/test-route
   *
   * Envoie un embed factice dans le salon `channelId` pour permettre à
   * l'admin de vérifier qu'une route fonctionne avant de l'enregistrer.
   * Retourne `{ ok: true }` si Discord a accepté, ou `{ reason }` avec
   * le code HTTP approprié en cas d'échec.
   *
   * Accès restreint : MANAGE_GUILD Discord requis.
   */
  app.post<{ Params: { guildId: string }; Body: { channelId: string } }>(
    '/guilds/:guildId/modules/logs/test-route',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.discordService) {
        return reply.code(503).send({ reason: 'service-indisponible' });
      }

      const { channelId } = request.body as { channelId: unknown };
      if (typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
        return reply.code(400).send({ reason: 'channelId invalide' });
      }

      const now = new Date().toISOString();

      try {
        await options.discordService.sendEmbed(assertChannelId(channelId), {
          kind: 'embed',
          payload: {
            title: 'Test de la route',
            description:
              'Si tu vois ce message, la route fonctionne correctement. Tu peux fermer ce test.',
            color: 0x2ecc71,
            timestamp: now,
            footer: { text: `Varde · ${now}` },
          },
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof DiscordSendError) {
          return reply.code(502).send({ reason: error.reason });
        }
        return reply.code(500).send({ reason: 'unknown' });
      }
    },
  );

  /**
   * Route : POST /guilds/:guildId/modules/logs/broken-routes/:routeId/replay
   *
   * Rejoue les events bufferisés d'une route Discord cassée. Synchrone
   * côté HTTP ; borne ~5s (100 events × 50ms). Retourne le nombre
   * d'events rejoués, le nombre encore en échec, et la première
   * `DiscordSendError` rencontrée (le cas échéant).
   *
   * Accès restreint : MANAGE_GUILD Discord requis.
   */
  app.post<{ Params: { guildId: string; routeId: string } }>(
    '/guilds/:guildId/modules/logs/broken-routes/:routeId/replay',
    async (request, reply: FastifyReply) => {
      const { guildId, routeId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.discordService) {
        return reply.code(503).send({ reason: 'service-indisponible' });
      }

      const service = options.discordService;
      const result = await replayBrokenRouteFor(guildId, routeId, (channelId, message) =>
        service.sendEmbed(assertChannelId(channelId), message),
      );

      return {
        replayed: result.replayed,
        failed: result.failed,
        ...(result.firstError ? { firstError: { reason: result.firstError.reason } } : {}),
      };
    },
  );
}
