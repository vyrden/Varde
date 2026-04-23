import { getBrokenRoutesFor } from '@varde/module-logs';
import type { FastifyInstance } from 'fastify';
import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Options d'enregistrement des routes du module logs.
 */
export interface RegisterLogsRoutesOptions {
  readonly discord: DiscordClient;
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
}
