import type { FastifyInstance, FastifyRequest } from 'fastify';

import { type DiscordClient, hasManageGuild } from '../discord-client.js';
import type { SessionData } from '../server.js';

/**
 * Garde-fou réutilisé par les routes `/guilds/:guildId/...` : vérifie
 * que l'appelant est authentifié ET qu'il a la permission Discord
 * `MANAGE_GUILD` sur la guild ciblée.
 *
 * Les erreurs prennent la forme d'un `Error & { statusCode }` exploité
 * par le `setErrorHandler` de `createApiServer` :
 * - 401 si aucune session (propagé depuis `ensureSession`).
 * - 400 si la session n'a pas d'access_token (cas où le dashboard a
 *   oublié de le propager dans le JWT).
 * - 403 si le user n'a pas MANAGE_GUILD sur la guild (qu'il en soit
 *   membre ou pas).
 *
 * Utilise le même `DiscordClient` que `GET /guilds` → cache TTL 60 s
 * partagé, un seul appel Discord par fenêtre et par user.
 */
export async function requireGuildAdmin(
  app: FastifyInstance,
  request: FastifyRequest,
  guildId: string,
  discord: DiscordClient,
): Promise<SessionData> {
  const session = await app.ensureSession(request);
  if (typeof session.accessToken !== 'string' || session.accessToken.length === 0) {
    const err: Error & { statusCode?: number; code?: string } = new Error(
      'La session ne porte pas d access_token Discord.',
    );
    err.statusCode = 400;
    err.code = 'missing_access_token';
    throw err;
  }
  const userGuilds = await discord.fetchUserGuilds(session.accessToken);
  const target = userGuilds.find((g) => g.id === guildId);
  if (!target || !hasManageGuild(target.permissions)) {
    const err: Error & { statusCode?: number; code?: string } = new Error(
      'Permission MANAGE_GUILD requise sur cette guild.',
    );
    err.statusCode = 403;
    err.code = 'forbidden';
    throw err;
  }
  return session;
}
