import type { GuildId, PermissionLevel, UserId } from '@varde/contracts';
import type { GuildPermissionsService } from '@varde/core';
import type { DbClient, DbDriver } from '@varde/db';
import { pgSchema, sqliteSchema } from '@varde/db';
import { inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { DiscordClient } from '../discord-client.js';

/**
 * Enregistre les routes `/guilds` sur l'instance Fastify fournie.
 *
 * `GET /guilds` : retourne la liste des serveurs accessibles à
 * l'utilisateur connecté ET où le bot est présent. Pipeline (jalon
 * 7 PR 7.3 — migration depuis check binaire MANAGE_GUILD) :
 *
 * 1. `ensureSession(request)` — 401 si pas de session.
 * 2. Refus 400 si la session n'a pas d'`accessToken` (le dashboard
 *    doit avoir passé le token Discord dans le JWT — sert à
 *    matérialiser quelles guilds le user voit côté Discord).
 * 3. `discord.fetchUserGuilds(accessToken)` — appel Discord API
 *    avec cache TTL 60 s par défaut.
 * 4. Intersection avec la table `guilds` locale (seuls les servers
 *    où le bot est enregistré ressortent).
 * 5. Pour chaque candidat, `guildPermissions.getUserLevel(guildId,
 *    userId)` — exclu si `null` (l'user n'a aucun rôle d'accès).
 *    Cache LRU 60 s sur le service, donc une visite typique tape
 *    une seule fois la DB par guild + 1 fois le cache discord.js
 *    pour les rôles utilisateur.
 * 6. Retourne `{ id, name, iconUrl | null }[]`.
 *
 * **Note** : on ne filtre plus par MANAGE_GUILD côté Discord. La
 * vérité d'accès vit désormais dans `guild_permissions` (cf.
 * `guildPermissionsService`).
 */

export interface AdminGuildDto {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

export interface RegisterGuildsRoutesOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly discord: DiscordClient;
  readonly guildPermissions: GuildPermissionsService;
}

const iconUrlOf = (guildId: string, iconHash: string | null): string | null =>
  iconHash ? `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png` : null;

const selectKnownGuildIds = async <D extends DbDriver>(
  client: DbClient<D>,
  candidateIds: readonly string[],
): Promise<Set<string>> => {
  if (candidateIds.length === 0) {
    return new Set();
  }
  if (client.driver === 'pg') {
    const { guilds } = pgSchema;
    const rows = await (
      client.db as unknown as {
        select: (fields: { readonly id: typeof guilds.id }) => {
          from: (table: typeof guilds) => {
            where: (cond: unknown) => Promise<{ id: string }[]>;
          };
        };
      }
    )
      .select({ id: guilds.id })
      .from(guilds)
      .where(inArray(guilds.id, [...candidateIds]));
    return new Set(rows.map((r) => r.id));
  }
  const { guilds } = sqliteSchema;
  const rows = (
    client.db as unknown as {
      select: (fields: { readonly id: typeof guilds.id }) => {
        from: (table: typeof guilds) => {
          where: (cond: unknown) => { all: () => { id: string }[] };
        };
      };
    }
  )
    .select({ id: guilds.id })
    .from(guilds)
    .where(inArray(guilds.id, [...candidateIds]))
    .all();
  return new Set(rows.map((r) => r.id));
};

export function registerGuildsRoutes<D extends DbDriver>(
  app: FastifyInstance,
  options: RegisterGuildsRoutesOptions<D>,
): void {
  app.get('/guilds', async (request, reply) => {
    const session = await app.ensureSession(request);
    if (typeof session.accessToken !== 'string' || session.accessToken.length === 0) {
      void reply.status(400).send({
        error: 'missing_access_token',
        message:
          'La session ne porte pas d access_token Discord. Le dashboard doit le propager dans le JWT.',
      });
      return;
    }

    const userGuilds = await options.discord.fetchUserGuilds(session.accessToken);
    const knownIds = await selectKnownGuildIds(
      options.client,
      userGuilds.map((g) => g.id),
    );

    // Filtre par niveau d'accès via `guildPermissionsService` (cf.
    // doc en tête du module). Sequential await accepté : le cache
    // LRU couvre les hits, une page typique a < 30 guilds.
    const result: AdminGuildDto[] = [];
    for (const g of userGuilds) {
      if (!knownIds.has(g.id)) continue;
      const level = await options.guildPermissions.getUserLevel(
        g.id as GuildId,
        session.userId as UserId,
      );
      if (level === null) continue;
      result.push({
        id: g.id,
        name: g.name,
        iconUrl: iconUrlOf(g.id, g.icon),
      });
    }
    return result;
  });

  /**
   * `GET /guilds/:guildId/me` — niveau d'accès du user sur la guild
   * (jalon 7 PR 7.3). Sert au dashboard (layout sidebar) à savoir
   * quels liens conditionnels afficher. 401 sans session, 404 si
   * pas de niveau d'accès — `requireGuildAccess('moderator')` couvre
   * exactement ces deux cas (admin satisfait aussi).
   */
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/me',
    async (request): Promise<{ readonly level: PermissionLevel }> => {
      const { guildId } = request.params;
      const session = await app.ensureSession(request);
      if (typeof session.userId !== 'string' || session.userId.length === 0) {
        const err: Error & { statusCode?: number; code?: string } = new Error('Not Found');
        err.statusCode = 404;
        err.code = 'not_found';
        throw err;
      }
      const level = await options.guildPermissions.getUserLevel(
        guildId as GuildId,
        session.userId as UserId,
      );
      if (level === null) {
        const err: Error & { statusCode?: number; code?: string } = new Error('Not Found');
        err.statusCode = 404;
        err.code = 'not_found';
        throw err;
      }
      return { level };
    },
  );
}
