import type { DbClient, DbDriver } from '@varde/db';
import { pgSchema, sqliteSchema } from '@varde/db';
import { inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { type DiscordClient, hasManageGuild } from '../discord-client.js';

/**
 * Enregistre les routes `/guilds` sur l'instance Fastify fournie.
 *
 * `GET /guilds` : retourne la liste des serveurs administrables par
 * l'utilisateur connecté ET où le bot est présent. Pipeline :
 *
 * 1. `ensureSession(request)` — 401 si pas de session.
 * 2. Refus 400 si la session n'a pas d'`accessToken` (le dashboard
 *    doit avoir passé le token Discord dans le JWT).
 * 3. `discord.fetchUserGuilds(accessToken)` — appel Discord API
 *    avec cache TTL 60 s par défaut (voir DiscordClient).
 * 4. Filtre : bit `MANAGE_GUILD` (0x20) dans `permissions`.
 * 5. Intersection avec la table `guilds` locale (seuls les servers
 *    où le bot est enregistré ressortent).
 * 6. Retourne `{ id, name, iconUrl | null }[]`.
 */

export interface AdminGuildDto {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

export interface RegisterGuildsRoutesOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly discord: DiscordClient;
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
    const adminGuilds = userGuilds.filter((g) => hasManageGuild(g.permissions));
    const knownIds = await selectKnownGuildIds(
      options.client,
      adminGuilds.map((g) => g.id),
    );

    const result: AdminGuildDto[] = adminGuilds
      .filter((g) => knownIds.has(g.id))
      .map((g) => ({
        id: g.id,
        name: g.name,
        iconUrl: iconUrlOf(g.id, g.icon),
      }));
    return result;
  });
}
