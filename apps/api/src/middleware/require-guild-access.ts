import type { GuildId, PermissionLevel, UserId } from '@varde/contracts';
import type { GuildPermissionsService } from '@varde/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { SessionData } from '../server.js';

/**
 * Garde-fou « accès dashboard d'une guild » (jalon 7 PR 7.3
 * sub-livrable 5).
 *
 * Remplace `requireGuildAdmin` (check binaire MANAGE_GUILD côté
 * Discord) par un check granulaire alimenté par
 * `guildPermissionsService.getUserLevel`. Le niveau requis est
 * passé en paramètre :
 *
 * - `'admin'` → seuls les users avec un rôle dans `adminRoleIds`
 *   ou le propriétaire Discord du serveur passent.
 * - `'moderator'` → admin OU rôle dans `moderatorRoleIds`.
 *
 * Codes HTTP retournés (cohérents avec le reste de l'API) :
 *
 * - 401 : pas de session (propagé via `ensureSession`).
 * - 404 : session valide mais aucun niveau d'accès. On retourne
 *   404 plutôt que 403 pour ne pas révéler l'existence d'une
 *   guild à un user qui n'y a pas accès (mêmes principes que
 *   `requireOwner`).
 *
 * Aucune garantie sur l'`access_token` Discord — la décision se
 * fait sur le `userId` de la session et le cache discord.js (pas
 * d'aller-retour Discord ici).
 */
export async function requireGuildAccess(
  app: FastifyInstance,
  request: FastifyRequest,
  guildId: GuildId,
  guildPermissions: GuildPermissionsService,
  requiredLevel: PermissionLevel,
): Promise<SessionData> {
  const session = await app.ensureSession(request);
  if (typeof session.userId !== 'string' || session.userId.length === 0) {
    const err: Error & { statusCode?: number; code?: string } = new Error('Not Found');
    err.statusCode = 404;
    err.code = 'not_found';
    throw err;
  }
  const granted = await guildPermissions.canAccessModule(
    guildId,
    session.userId as UserId,
    requiredLevel,
  );
  if (!granted) {
    const err: Error & { statusCode?: number; code?: string } = new Error('Not Found');
    err.statusCode = 404;
    err.code = 'not_found';
    throw err;
  }
  return session;
}
