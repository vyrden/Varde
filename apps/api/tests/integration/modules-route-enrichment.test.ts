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
  createUserPreferencesService,
  type GuildPermissionsContext,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  registerModulesRoutes,
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

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const ADMIN_ROLE = 'role-admin';

const auth = (userId: string): Record<string, string> => ({
  'x-test-session': JSON.stringify({ userId, accessToken: 'tok' }),
});

interface ManifestExtras {
  readonly category?: string;
  readonly icon?: string;
  readonly shortDescription?: string;
}

const makeEnrichedModule = (id: string, extras: ManifestExtras = {}) => {
  return defineModule({
    manifest: {
      id: id as ModuleId,
      name: `Module ${id}`,
      version: '1.0.0',
      coreVersion: '^1.0.0',
      description: `Module ${id} description complète`,
      author: { name: 'X' },
      license: 'Apache-2.0',
      schemaVersion: 0,
      permissions: [],
      events: { listen: [], emit: [] as string[] },
      ...(extras.category !== undefined ? { category: extras.category } : {}),
      ...(extras.icon !== undefined ? { icon: extras.icon } : {}),
      ...(extras.shortDescription !== undefined
        ? { shortDescription: extras.shortDescription }
        : {}),
    },
  });
};

interface BuildOptions {
  readonly modules?: ReadonlyArray<{ id: string; extras?: ManifestExtras }>;
  readonly pinnedModules?: readonly { moduleId: string; position: number }[];
  readonly auditEntries?: ReadonlyArray<{
    readonly action: ActionId;
    readonly metadata?: Record<string, unknown>;
  }>;
}

interface ModuleListItem {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly category: string | null;
  readonly icon: string | null;
  readonly shortDescription: string | null;
  readonly isPinned: boolean;
  readonly lastConfiguredAt: string | null;
  readonly permissions: readonly unknown[];
}

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  return client;
};

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
): Promise<{ app: Awaited<ReturnType<typeof createApiServer>>; audit: CoreAuditService }> => {
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
  const discord = createDiscordClient({
    fetch: async () => new Response('{}', { status: 200 }),
  });
  const context: GuildPermissionsContext = {
    getAdminRoleIds: async () => [ADMIN_ROLE],
    getOwnerId: async () => null,
    getUserRoleIds: async () => [ADMIN_ROLE],
  };
  const guildPermissions = createGuildPermissionsService({ client, context });
  const userPreferences = createUserPreferencesService({ client });
  const audit = createAuditService({ client });

  await guildPermissions.updateConfig(
    GUILD,
    { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [] },
    { type: 'system' },
  );

  for (const m of buildOptions.modules ?? []) {
    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values({ id: m.id, version: '1.0.0', manifest: {}, schemaVersion: 0 })
      .run();
    loader.register(makeEnrichedModule(m.id, m.extras));
  }
  await loader.loadAll();

  if (buildOptions.pinnedModules) {
    await userPreferences.updatePinnedModules(USER, GUILD, buildOptions.pinnedModules);
  }

  for (const entry of buildOptions.auditEntries ?? []) {
    await audit.log({
      guildId: GUILD,
      action: entry.action,
      actor: { type: 'user', id: USER },
      severity: 'info',
      metadata: entry.metadata ?? {},
    });
  }

  const app = await createApiServer({
    logger,
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerModulesRoutes(app, {
    loader,
    config,
    discord,
    guildPermissions,
    userPreferences,
    audit,
  });
  return { app, audit };
};

describe('GET /guilds/:guildId/modules — enrichissement (jalon 7 PR 7.4.3)', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('expose category, icon, shortDescription depuis le manifeste', async () => {
    const { app } = await build(client, {
      modules: [
        {
          id: 'moderation',
          extras: {
            category: 'moderation',
            icon: 'shield-check',
            shortDescription: 'Sanctions et automod.',
          },
        },
      ],
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth(USER),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ModuleListItem[];
      const moderation = body.find((m) => m.id === 'moderation');
      expect(moderation).toBeDefined();
      expect(moderation?.category).toBe('moderation');
      expect(moderation?.icon).toBe('shield-check');
      expect(moderation?.shortDescription).toBe('Sanctions et automod.');
    } finally {
      await app.close();
    }
  });

  it('renvoie null pour les champs non fournis par un manifeste tiers', async () => {
    const { app } = await build(client, {
      modules: [{ id: 'tiers' }],
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth(USER),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ModuleListItem[];
      const tiers = body.find((m) => m.id === 'tiers');
      expect(tiers?.category).toBeNull();
      expect(tiers?.icon).toBeNull();
      expect(tiers?.shortDescription).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('expose isPinned=true pour les modules épinglés par cet utilisateur', async () => {
    const { app } = await build(client, {
      modules: [{ id: 'moderation' }, { id: 'welcome' }, { id: 'logs' }],
      pinnedModules: [
        { moduleId: 'moderation', position: 0 },
        { moduleId: 'welcome', position: 1 },
      ],
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth(USER),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ModuleListItem[];
      const byId = Object.fromEntries(body.map((m) => [m.id, m]));
      expect(byId['moderation']?.isPinned).toBe(true);
      expect(byId['welcome']?.isPinned).toBe(true);
      expect(byId['logs']?.isPinned).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('isPinned est par-utilisateur (un autre user voit ses propres pins)', async () => {
    const { app } = await build(client, {
      modules: [{ id: 'moderation' }],
      pinnedModules: [{ moduleId: 'moderation', position: 0 }],
    });
    try {
      const resA = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth(USER),
      });
      const resB = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth('other-user'),
      });
      expect((resA.json() as ModuleListItem[])[0]?.isPinned).toBe(true);
      expect((resB.json() as ModuleListItem[])[0]?.isPinned).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('expose lastConfiguredAt = timestamp du dernier core.config.updated avec scope modules.<id>', async () => {
    const { app } = await build(client, {
      modules: [{ id: 'moderation' }, { id: 'welcome' }],
      auditEntries: [
        {
          action: 'core.config.updated' as ActionId,
          metadata: { scope: 'modules.moderation' },
        },
        {
          action: 'core.config.updated' as ActionId,
          metadata: { scope: 'modules.welcome' },
        },
      ],
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth(USER),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ModuleListItem[];
      const moderation = body.find((m) => m.id === 'moderation');
      const welcome = body.find((m) => m.id === 'welcome');
      expect(typeof moderation?.lastConfiguredAt).toBe('string');
      expect(typeof welcome?.lastConfiguredAt).toBe('string');
      // ISO 8601 valide
      expect(new Date(moderation?.lastConfiguredAt ?? '').getTime()).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('lastConfiguredAt = null pour un module jamais configuré', async () => {
    const { app } = await build(client, {
      modules: [{ id: 'moderation' }],
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth(USER),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ModuleListItem[];
      expect(body[0]?.lastConfiguredAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("ignore les core.config.updated qui ne pointent pas sur un module (scope='core')", async () => {
    const { app } = await build(client, {
      modules: [{ id: 'moderation' }],
      auditEntries: [
        {
          action: 'core.config.updated' as ActionId,
          metadata: { scope: 'core' },
        },
      ],
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: auth(USER),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ModuleListItem[];
      expect(body[0]?.lastConfiguredAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('garde la dernière (plus récente) entrée quand un module a plusieurs core.config.updated', async () => {
    const { app, audit } = await build(client, {
      modules: [{ id: 'moderation' }],
    });
    try {
      // Première écriture (la plus ancienne).
      await audit.log({
        guildId: GUILD,
        action: 'core.config.updated' as ActionId,
        actor: { type: 'user', id: USER },
        severity: 'info',
        metadata: { scope: 'modules.moderation' },
      });
      const before = (
        await app
          .inject({ method: 'GET', url: `/guilds/${GUILD}/modules`, headers: auth(USER) })
          .then((r) => r.json())
      )[0]?.lastConfiguredAt as string;
      // Petit délai pour garantir un timestamp strictement croissant.
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Deuxième écriture (la plus récente).
      await audit.log({
        guildId: GUILD,
        action: 'core.config.updated' as ActionId,
        actor: { type: 'user', id: USER },
        severity: 'info',
        metadata: { scope: 'modules.moderation' },
      });
      const after = (
        await app
          .inject({ method: 'GET', url: `/guilds/${GUILD}/modules`, headers: auth(USER) })
          .then((r) => r.json())
      )[0]?.lastConfiguredAt as string;
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    } finally {
      await app.close();
    }
  });
});
