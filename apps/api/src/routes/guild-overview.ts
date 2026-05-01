import type { ActionId, GuildId } from '@varde/contracts';
import type { CoreAuditService, GuildPermissionsService, PluginLoader } from '@varde/core';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema } from '@varde/db';
import { and, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireGuildAccess } from '../middleware/require-guild-access.js';
import type { DiscordStatusSnapshot } from './admin-overview.js';

/**
 * Route `GET /guilds/:guildId/overview` (jalon 7 PR 7.4.2). Tableau
 * de bord d'actions par-guild, pas un panneau de stats.
 *
 * Composé de 5 blocs :
 *
 * - **`guild`** : nom + icône + memberCount, depuis le snapshot
 *   discord.js injecté (`getGuildSnapshot`). Si le snapshot est `null`
 *   (cache pas encore peuplé, guild expulsée…), les champs nullables
 *   tombent à `null` plutôt que d'échouer la route.
 * - **`bot`** : statut runtime (connected, latencyMs) injecté par
 *   `getDiscordStatus`, et `lastEventAt` = max(`createdAt`) de
 *   l'audit_log pour cette guild — utile pour repérer un serveur où
 *   plus rien ne se passe (silence persistant = problème).
 * - **`recentChanges`** : top 3 des entrées `core.config.updated`
 *   sur les 30 derniers jours, avec `moduleId` extrait du
 *   `metadata.scope` (`modules.<id>` → `<id>`, `core` → `null`).
 * - **`recentActivity`** : agrégation par catégorie (préfixe avant le
 *   premier `.` de l'action) sur les dernières 24 h. Mis en cache 60 s
 *   par guild — c'est le bloc le plus coûteux, et le seul qui a une
 *   raison de tolérer un léger lag (le reste se voit immédiatement).
 * - **`modulesStats`** : `{ total, active, configured }`. `total` =
 *   `loader.loadOrder().length` (modules chargés sur l'instance).
 *   `active` = COUNT `guild_modules` où `enabled=true` pour cette
 *   guild. `configured` = nombre de clés sous `guild_config.config.modules`
 *   pour cette guild.
 *
 * Auth : `requireGuildAccess('moderator')` — un mod ou un admin de la
 * guild peut consulter l'overview. Niveau aligné sur les autres
 * routes me/guilds/* (cf. PR 7.4.1).
 */

/** Snapshot d'une guild Discord, fourni par le runtime. */
export interface GuildSnapshot {
  readonly name: string;
  readonly iconUrl: string | null;
  readonly memberCount: number | null;
}

/** Forme retournée par `GET /guilds/:guildId/overview`. */
export interface GuildOverviewResponse {
  readonly guild: {
    readonly id: string;
    readonly name: string | null;
    readonly iconUrl: string | null;
    readonly memberCount: number | null;
  };
  readonly bot: {
    readonly connected: boolean;
    readonly latencyMs: number | null;
    readonly lastEventAt: string | null;
  };
  readonly recentChanges: readonly {
    readonly moduleId: string | null;
    readonly modifiedBy: string | null;
    readonly at: string;
  }[];
  readonly recentActivity: {
    readonly byCategory: Readonly<Record<string, number>>;
    readonly totalLast24h: number;
  };
  readonly modulesStats: {
    readonly total: number;
    readonly active: number;
    readonly configured: number;
  };
}

export interface RegisterGuildOverviewRoutesOptions {
  readonly client: DbClient<DbDriver>;
  readonly loader: PluginLoader;
  readonly guildPermissions: GuildPermissionsService;
  readonly audit: CoreAuditService;
  /**
   * Snapshot Discord d'une guild — name, iconUrl, memberCount. `null`
   * si la guild n'est pas dans le cache discord.js (peut arriver au
   * démarrage, ou si la guild a été expulsée).
   */
  readonly getGuildSnapshot: (guildId: string) => Promise<GuildSnapshot | null>;
  /**
   * Statut runtime du bot Discord — réutilisé depuis `admin-overview`.
   * Optionnel : si non fourni, on tombe sur `connected: false`.
   */
  readonly getDiscordStatus?: () => DiscordStatusSnapshot;
  /**
   * TTL du cache `recentActivity` en ms. Défaut : 60 000.
   * Injectable pour les tests qui veulent vérifier l'expiration.
   */
  readonly recentActivityCacheTtlMs?: number;
  /** Horloge injectable pour les tests. */
  readonly now?: () => number;
}

const DEFAULT_DISCORD_STATUS: DiscordStatusSnapshot = {
  connected: false,
  latencyMs: null,
};

const RECENT_CHANGES_LIMIT = 3;
const RECENT_CHANGES_DAYS = 30;
const RECENT_ACTIVITY_HOURS = 24;
const RECENT_ACTIVITY_QUERY_LIMIT = 5_000;
const DEFAULT_CACHE_TTL_MS = 60_000;

interface RecentActivity {
  readonly byCategory: Readonly<Record<string, number>>;
  readonly totalLast24h: number;
}

/**
 * Extrait le moduleId depuis le `metadata.scope` d'une entrée
 * `core.config.updated`. `modules.welcome` → `'welcome'`,
 * `core` → `null`, autre → `null`.
 */
const extractModuleIdFromScope = (metadata: Readonly<Record<string, unknown>>): string | null => {
  const scope = metadata['scope'];
  if (typeof scope !== 'string' || !scope.startsWith('modules.')) {
    return null;
  }
  const remainder = scope.slice('modules.'.length);
  return remainder.length > 0 ? remainder : null;
};

const categoryFromAction = (action: string): string => {
  const dotIdx = action.indexOf('.');
  return dotIdx === -1 ? action : action.slice(0, dotIdx);
};

const countActiveModules = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
): Promise<number> => {
  if (client.driver === 'pg') {
    const { guildModules } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({ value: count() })
      .from(guildModules)
      .where(and(eq(guildModules.guildId, guildId), eq(guildModules.enabled, true)));
    return Number(rows[0]?.value ?? 0);
  }
  const { guildModules } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select({ value: count() })
    .from(guildModules)
    .where(and(eq(guildModules.guildId, guildId), eq(guildModules.enabled, true)))
    .get();
  return Number(row?.value ?? 0);
};

const countConfiguredModules = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
): Promise<number> => {
  // Lecture du blob JSON `guild_config.config` puis comptage des
  // clés sous `modules`. La structure est `{ core: {...}, modules:
  // { welcome: {...}, moderation: {...} } }` (cf. config.ts).
  const readConfig = async (): Promise<Readonly<Record<string, unknown>> | null> => {
    if (client.driver === 'pg') {
      const { guildConfig } = pgSchema;
      const pg = client as DbClient<'pg'>;
      const rows = await pg.db
        .select({ config: guildConfig.config })
        .from(guildConfig)
        .where(eq(guildConfig.guildId, guildId))
        .limit(1);
      return (rows[0]?.config as Readonly<Record<string, unknown>> | undefined) ?? null;
    }
    const { guildConfig } = sqliteSchema;
    const sqlite = client as DbClient<'sqlite'>;
    const row = sqlite.db
      .select({ config: guildConfig.config })
      .from(guildConfig)
      .where(eq(guildConfig.guildId, guildId))
      .limit(1)
      .get();
    return (row?.config as Readonly<Record<string, unknown>> | undefined) ?? null;
  };

  const config = await readConfig();
  if (config === null) return 0;
  const modules = config['modules'];
  if (modules === null || typeof modules !== 'object') return 0;
  return Object.keys(modules as Record<string, unknown>).length;
};

export function registerGuildOverviewRoutes(
  app: FastifyInstance,
  options: RegisterGuildOverviewRoutesOptions,
): void {
  const { client, loader, guildPermissions, audit, getGuildSnapshot } = options;
  const getDiscordStatus = options.getDiscordStatus ?? (() => DEFAULT_DISCORD_STATUS);
  const cacheTtlMs = options.recentActivityCacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? (() => Date.now());

  // Cache simple keyed sur guildId. Pas d'éviction LRU — le cache est
  // borné par le nombre de guilds, naturellement limité par instance.
  const recentActivityCache = new Map<string, { value: RecentActivity; expiresAt: number }>();

  const computeRecentActivity = async (guildId: GuildId): Promise<RecentActivity> => {
    const since = new Date(now() - RECENT_ACTIVITY_HOURS * 60 * 60 * 1000);
    const rows = await audit.query({
      guildId,
      since,
      limit: RECENT_ACTIVITY_QUERY_LIMIT,
    });
    const byCategory: Record<string, number> = {};
    for (const row of rows) {
      const category = categoryFromAction(row.action);
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
    return { byCategory, totalLast24h: rows.length };
  };

  const getRecentActivity = async (guildId: GuildId): Promise<RecentActivity> => {
    const cached = recentActivityCache.get(guildId);
    if (cached !== undefined && cached.expiresAt > now()) {
      return cached.value;
    }
    const fresh = await computeRecentActivity(guildId);
    recentActivityCache.set(guildId, { value: fresh, expiresAt: now() + cacheTtlMs });
    return fresh;
  };

  const computeRecentChanges = async (
    guildId: GuildId,
  ): Promise<GuildOverviewResponse['recentChanges']> => {
    const since = new Date(now() - RECENT_CHANGES_DAYS * 24 * 60 * 60 * 1000);
    const rows = await audit.query({
      guildId,
      action: 'core.config.updated' as ActionId,
      since,
      limit: RECENT_CHANGES_LIMIT,
    });
    return rows.map((row) => ({
      moduleId: extractModuleIdFromScope(row.metadata),
      modifiedBy: row.actorId ?? null,
      at: row.createdAt,
    }));
  };

  const computeLastEventAt = async (guildId: GuildId): Promise<string | null> => {
    // `audit.query` est ordonné desc par défaut → on demande la 1ʳᵉ
    // entrée et on lit son `createdAt`.
    const rows = await audit.query({ guildId, limit: 1 });
    return rows[0]?.createdAt ?? null;
  };

  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/overview',
    async (request): Promise<GuildOverviewResponse> => {
      const { guildId } = request.params;
      await requireGuildAccess(app, request, guildId as GuildId, guildPermissions, 'moderator');

      const [snapshot, lastEventAt, recentChanges, recentActivity, activeCount, configuredCount] =
        await Promise.all([
          getGuildSnapshot(guildId),
          computeLastEventAt(guildId as GuildId),
          computeRecentChanges(guildId as GuildId),
          getRecentActivity(guildId as GuildId),
          countActiveModules(client, guildId as GuildId),
          countConfiguredModules(client, guildId as GuildId),
        ]);

      const status = getDiscordStatus();

      return {
        guild: {
          id: guildId,
          name: snapshot?.name ?? null,
          iconUrl: snapshot?.iconUrl ?? null,
          memberCount: snapshot?.memberCount ?? null,
        },
        bot: {
          connected: status.connected,
          latencyMs: status.latencyMs,
          lastEventAt,
        },
        recentChanges,
        recentActivity,
        modulesStats: {
          total: loader.loadOrder().length,
          active: activeCount,
          configured: configuredCount,
        },
      };
    },
  );
}
