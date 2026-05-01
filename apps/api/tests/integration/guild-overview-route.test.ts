import { randomBytes } from 'node:crypto';

import type { ActionId, GuildId, ModuleId, UserId } from '@varde/contracts';
import { defineModule } from '@varde/contracts';
import {
  type CoreAuditService,
  createAuditService,
  createConfigService,
  createCtxFactory,
  createEventBus,
  createGuildPermissionsService,
  createLogger,
  createPermissionService,
  createPluginLoader,
  type GuildPermissionsContext,
  type PluginLoader,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  type GuildSnapshot,
  registerGuildOverviewRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const auth = (userId: string): Record<string, string> => ({
  'x-test-session': JSON.stringify({ userId }),
});

const GUILD: GuildId = '111' as GuildId;
const ADMIN_ROLE = 'role-admin';

interface BuildOptions {
  readonly hasGuildAccess?: boolean;
  readonly guildSnapshot?: GuildSnapshot | null;
  readonly registerModules?: readonly string[];
  readonly enableModules?: readonly string[];
  readonly configuredModules?: readonly string[];
}

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  return client;
};

const seedAudit = async (
  audit: CoreAuditService,
  guildId: GuildId,
  entries: ReadonlyArray<{
    readonly action: ActionId;
    readonly metadata?: Record<string, unknown>;
    readonly actorId?: UserId;
  }>,
): Promise<void> => {
  for (const entry of entries) {
    await audit.log({
      guildId,
      action: entry.action,
      actor: entry.actorId ? { type: 'user', id: entry.actorId } : { type: 'system' },
      severity: 'info',
      metadata: entry.metadata ?? {},
    });
  }
};

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  audit: CoreAuditService;
  loader: PluginLoader;
  config: ReturnType<typeof createConfigService>;
}> => {
  const hasGuildAccess = buildOptions.hasGuildAccess ?? true;
  const logger = silentLogger();
  const eventBus = createEventBus({ logger });
  const config = createConfigService({ client });
  const permissions = createPermissionService({
    client,
    resolveMemberContext: async () => null,
  });
  const bundle = createCtxFactory({
    client,
    loggerRoot: logger,
    eventBus,
    config,
    permissions,
    keystoreMasterKey: randomBytes(32),
  });
  const loader = createPluginLoader({
    coreVersion: '1.0.0',
    logger,
    ctxFactory: bundle.factory,
  });
  const audit = createAuditService({ client });

  const guildPermissionsContext: GuildPermissionsContext = {
    getAdminRoleIds: async () => [ADMIN_ROLE],
    getOwnerId: async () => null,
    getUserRoleIds: async () => (hasGuildAccess ? [ADMIN_ROLE] : []),
  };
  const guildPermissions = createGuildPermissionsService({
    client,
    context: guildPermissionsContext,
  });
  await guildPermissions.updateConfig(
    GUILD,
    { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [] },
    { type: 'system' },
  );

  // Modules optionnellement enregistrés (loader + modules_registry)
  // + activés sur la guild (table guild_modules) + configurés
  // (guild_config.config.modules.X).
  for (const moduleId of buildOptions.registerModules ?? []) {
    const def = defineModule({
      manifest: {
        id: moduleId as ModuleId,
        name: moduleId,
        version: '1.0.0',
        coreVersion: '^1.0.0',
        description: '',
        author: { name: 'test' },
        license: 'Apache-2.0',
        schemaVersion: 0,
        permissions: [],
        events: { listen: [], emit: [] },
      },
    });
    loader.register(def);
    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values({ id: moduleId, version: '1.0.0', manifest: {}, schemaVersion: 0 })
      .run();
  }
  await loader.loadAll();
  for (const moduleId of buildOptions.enableModules ?? []) {
    await client.db
      .insert(sqliteSchema.guildModules)
      .values({
        guildId: GUILD,
        moduleId: moduleId as ModuleId,
        enabled: true,
      })
      .run();
  }
  if (buildOptions.configuredModules && buildOptions.configuredModules.length > 0) {
    const modules: Record<string, Record<string, unknown>> = {};
    for (const moduleId of buildOptions.configuredModules) {
      modules[moduleId] = { enabled: true };
    }
    await client.db
      .insert(sqliteSchema.guildConfig)
      .values({
        guildId: GUILD,
        config: { modules },
        version: 1,
      })
      .run();
  }

  const app = await createApiServer({
    logger,
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerGuildOverviewRoutes(app, {
    client,
    loader,
    guildPermissions,
    audit,
    getGuildSnapshot: async () =>
      buildOptions.guildSnapshot === undefined
        ? { name: 'Alpha', iconUrl: null, memberCount: 42 }
        : buildOptions.guildSnapshot,
    getDiscordStatus: () => ({ connected: true, latencyMs: 50 }),
  });
  return { app, audit, loader, config };
};

describe('GET /guilds/:guildId/overview', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('200 retourne la forme complète sur une guild fraîche', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.guild).toEqual({ id: GUILD, name: 'Alpha', iconUrl: null, memberCount: 42 });
      expect(body.bot).toMatchObject({ connected: true, latencyMs: 50 });
      expect(body.bot.lastEventAt).toBeNull();
      expect(body.recentChanges).toEqual([]);
      expect(body.recentActivity).toEqual({ byCategory: {}, totalLast24h: 0 });
      expect(body.modulesStats).toEqual({ total: 0, active: 0, configured: 0 });
    } finally {
      await app.close();
    }
  });

  it('200 calcule modulesStats à partir du loader, guild_modules et guild_config', async () => {
    const { app } = await build(client, {
      registerModules: ['moderation', 'welcome', 'logs'],
      enableModules: ['moderation', 'welcome'],
      configuredModules: ['moderation'],
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // total reflète les modules enregistrés (modules_registry).
      expect(body.modulesStats.total).toBe(3);
      expect(body.modulesStats.active).toBe(2);
      expect(body.modulesStats.configured).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('200 inclut les 3 derniers core.config.updated avec moduleId extrait du scope', async () => {
    const { app, audit } = await build(client);
    try {
      await seedAudit(audit, GUILD, [
        {
          action: 'core.config.updated' as ActionId,
          metadata: { scope: 'modules.moderation' },
          actorId: 'user-1' as UserId,
        },
        {
          action: 'core.config.updated' as ActionId,
          metadata: { scope: 'modules.welcome' },
          actorId: 'user-2' as UserId,
        },
        {
          action: 'core.config.updated' as ActionId,
          metadata: { scope: 'core' },
          actorId: 'user-1' as UserId,
        },
        {
          action: 'core.config.updated' as ActionId,
          metadata: { scope: 'modules.logs' },
          actorId: 'user-2' as UserId,
        },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.recentChanges).toHaveLength(3);
      // Trié desc par date (le dernier inséré en premier).
      expect(body.recentChanges[0]).toMatchObject({
        moduleId: 'logs',
        modifiedBy: 'user-2',
      });
      expect(body.recentChanges[1]).toMatchObject({
        moduleId: null,
        modifiedBy: 'user-1',
      });
      expect(body.recentChanges[2]).toMatchObject({
        moduleId: 'welcome',
        modifiedBy: 'user-2',
      });
    } finally {
      await app.close();
    }
  });

  it("200 agrège recentActivity par catégorie (préfixe avant le premier '.')", async () => {
    const { app, audit } = await build(client);
    try {
      await seedAudit(audit, GUILD, [
        { action: 'moderation.warn.applied' as ActionId },
        { action: 'moderation.warn.applied' as ActionId },
        { action: 'moderation.ban.applied' as ActionId },
        { action: 'welcome.member.greeted' as ActionId },
        { action: 'core.config.updated' as ActionId, metadata: { scope: 'core' } },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.recentActivity.totalLast24h).toBe(5);
      expect(body.recentActivity.byCategory).toEqual({
        moderation: 3,
        welcome: 1,
        core: 1,
      });
    } finally {
      await app.close();
    }
  });

  it('200 cache recentActivity 60 s (pas de re-query DB pendant le TTL)', async () => {
    const { app, audit } = await build(client);
    try {
      await seedAudit(audit, GUILD, [{ action: 'moderation.warn.applied' as ActionId }]);
      const querySpy = vi.spyOn(audit, 'query');
      const first = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      const callsAfterFirst = querySpy.mock.calls.length;
      const second = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      const callsAfterSecond = querySpy.mock.calls.length;
      expect(first.json().recentActivity.totalLast24h).toBe(1);
      expect(second.json().recentActivity.totalLast24h).toBe(1);
      // Le second appel ne doit pas avoir requeryé l'audit pour
      // recentActivity (mais peut le faire pour recentChanges qui
      // a un cache séparé / pas de cache).
      expect(callsAfterSecond - callsAfterFirst).toBeLessThan(callsAfterFirst);
    } finally {
      await app.close();
    }
  });

  it('200 lastEventAt = max(createdAt) audit pour cette guild', async () => {
    const { app, audit } = await build(client);
    try {
      await seedAudit(audit, GUILD, [{ action: 'moderation.warn.applied' as ActionId }]);
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      expect(typeof res.json().bot.lastEventAt).toBe('string');
      expect(new Date(res.json().bot.lastEventAt).getTime()).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('200 retourne memberCount: null quand le snapshot Discord est null', async () => {
    const { app } = await build(client, { guildSnapshot: null });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().guild).toEqual({
        id: GUILD,
        name: null,
        iconUrl: null,
        memberCount: null,
      });
    } finally {
      await app.close();
    }
  });

  it('404 si user sans accès', async () => {
    const { app } = await build(client, { hasGuildAccess: false });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/overview`,
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
