import type { OwnershipService, PluginLoader } from '@varde/core';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema } from '@varde/db';
import { count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireOwner } from '../middleware/require-owner.js';

/**
 * Route `GET /admin/overview` (jalon 7 PR 7.2). Vue d'ensemble de
 * santé/statut de l'instance pour le dashboard admin.
 *
 * Forme de la réponse alignée sur le plan PR2-admin instance.md
 * (« Vue d'ensemble »). Champs marqués `null` quand non disponibles
 * dans cette PR :
 *
 * - `guilds.totalMembers` : nécessite d'agréger les `member_count`
 *   reçus par event Discord ; pas encore tracé. Sera ajouté avec
 *   l'event `guildMemberAdd/Remove` complet.
 * - `db.sizeBytes` et `db.lastMigration` : besoins SQL spécifiques
 *   par driver (pg : `pg_database_size`, sqlite : `stat()` du
 *   fichier ; lastMigration : table drizzle interne). Reportés.
 *
 * Le statut Discord (`bot.connected`, `bot.latencyMs`) est fourni
 * par un provider injectable. `apps/server` câble la vraie
 * implémentation à partir du Client discord.js ; les tests passent
 * un stub. Si le provider n'est pas fourni, on retourne
 * `connected: false, latencyMs: null` pour ne pas mentir.
 */

/** Statut runtime du bot Discord — injecté par `apps/server`. */
export interface DiscordStatusSnapshot {
  /** `true` quand le Client discord.js est en `READY`. */
  readonly connected: boolean;
  /**
   * Latence WebSocket Discord en ms. `null` si pas mesurée encore
   * (avant le premier heartbeat) ou si le bot n'est pas connecté.
   */
  readonly latencyMs: number | null;
}

/** Réponse de `GET /admin/overview`. */
export interface AdminOverviewResponse {
  readonly bot: {
    readonly connected: boolean;
    readonly latencyMs: number | null;
    /** Uptime du process Node en secondes (`process.uptime()`). */
    readonly uptime: number;
    /** Version applicative — typiquement `coreVersion` de createServer. */
    readonly version: string;
  };
  readonly guilds: {
    readonly count: number;
    readonly totalMembers: number | null;
  };
  readonly modules: {
    /** Nombre de modules chargés par le `PluginLoader`. */
    readonly installed: number;
    /**
     * Nombre de bindings `(guild, module)` activés dans
     * `guild_modules` (`enabled = true`). C'est l'unité utilisée
     * par l'admin pour mesurer l'usage effectif d'un module au
     * sein de l'instance.
     */
    readonly active: number;
  };
  readonly db: {
    readonly driver: DbDriver;
    readonly sizeBytes: number | null;
    readonly lastMigration: string | null;
  };
}

/** Options de construction. */
export interface RegisterAdminOverviewRoutesOptions {
  readonly ownership: OwnershipService;
  readonly client: DbClient<DbDriver>;
  readonly loader: PluginLoader;
  /** Version applicative renvoyée dans `bot.version`. */
  readonly version: string;
  /**
   * Fournisseur du statut Discord. Optional : si non fourni, le
   * bot est rapporté `connected: false`. `apps/server` injecte
   * une closure qui lit `client.ws.ping` + `client.isReady()` du
   * discord.js Client.
   */
  readonly getDiscordStatus?: () => DiscordStatusSnapshot;
}

const DEFAULT_DISCORD_STATUS: DiscordStatusSnapshot = {
  connected: false,
  latencyMs: null,
};

const countGuilds = async <D extends DbDriver>(client: DbClient<D>): Promise<number> => {
  if (client.driver === 'pg') {
    const { guilds } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db.select({ value: count() }).from(guilds);
    return Number(rows[0]?.value ?? 0);
  }
  const { guilds } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db.select({ value: count() }).from(guilds).get();
  return Number(row?.value ?? 0);
};

const countActiveModules = async <D extends DbDriver>(client: DbClient<D>): Promise<number> => {
  if (client.driver === 'pg') {
    const { guildModules } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({ value: count() })
      .from(guildModules)
      .where(eq(guildModules.enabled, true));
    return Number(rows[0]?.value ?? 0);
  }
  const { guildModules } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select({ value: count() })
    .from(guildModules)
    .where(eq(guildModules.enabled, true))
    .get();
  return Number(row?.value ?? 0);
};

export function registerAdminOverviewRoutes(
  app: FastifyInstance,
  options: RegisterAdminOverviewRoutesOptions,
): void {
  const { ownership, client, loader, version } = options;
  const getDiscordStatus = options.getDiscordStatus ?? (() => DEFAULT_DISCORD_STATUS);

  app.get('/admin/overview', async (request): Promise<AdminOverviewResponse> => {
    await requireOwner(app, request, ownership);
    const status = getDiscordStatus();
    const [guildCount, activeModules] = await Promise.all([
      countGuilds(client),
      countActiveModules(client),
    ]);
    return {
      bot: {
        connected: status.connected,
        latencyMs: status.latencyMs,
        uptime: process.uptime(),
        version,
      },
      guilds: {
        count: guildCount,
        // Agrégation `totalMembers` à câbler quand le tracking
        // member_count par guild sera posé.
        totalMembers: null,
      },
      modules: {
        installed: loader.loadOrder().length,
        active: activeModules,
      },
      db: {
        driver: client.driver,
        // sizeBytes / lastMigration : SQL spécifique par driver,
        // reportés à une PR ultérieure.
        sizeBytes: null,
        lastMigration: null,
      },
    };
  });
}
