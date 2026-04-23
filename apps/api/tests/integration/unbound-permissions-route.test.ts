import { randomBytes } from 'node:crypto';
import type { GuildId, ModuleId, PermissionId } from '@varde/contracts';
import { defineModule } from '@varde/contracts';
import {
  createConfigService,
  createCtxFactory,
  createEventBus,
  createLogger,
  createPermissionService,
  createPluginLoader,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  type SessionData,
} from '../../src/index.js';
import { registerUnboundPermissionsRoutes } from '../../src/routes/unbound-permissions.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111' as GuildId;
const MOD_ID: ModuleId = 'logs' as ModuleId;
const MANAGE_PERM: PermissionId = 'logs.config.manage' as PermissionId;

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const discordGuild = (id: string, permissions: string): DiscordGuild => ({
  id,
  name: `Guild ${id}`,
  icon: null,
  permissions,
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200 });

/** Session admin avec access_token. */
const authHeader = {
  'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
};

/** Fetch Discord qui répond comme admin de la guild. */
const adminFetch: FetchLike = async () => jsonResponse([discordGuild(GUILD, '0x20')]);

/** Fetch Discord qui répond sans permission MANAGE_GUILD (0x8 = BAN_MEMBERS, pas MANAGE_GUILD). */
const nonAdminFetch: FetchLike = async () => jsonResponse([discordGuild(GUILD, '0x8')]);

/** Module de test `logs` avec une permission déclarée. */
const makeLogsModule = () =>
  defineModule({
    manifest: {
      id: MOD_ID,
      name: 'Logs',
      version: '1.0.0',
      coreVersion: '^1.0.0',
      description: 'Module de logs test',
      author: { name: 'X' },
      license: 'Apache-2.0',
      schemaVersion: 0,
      permissions: [
        {
          id: MANAGE_PERM,
          category: 'config',
          defaultLevel: 'admin',
          description: 'Configurer les routes de logs.',
        },
      ],
      events: { listen: [], emit: [] },
    },
  });

describe('GET /guilds/:guildId/modules/:moduleId/unbound-permissions', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  });

  afterEach(async () => {
    await client.close();
  });

  const build = async (fetchImpl: FetchLike) => {
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

    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values({ id: MOD_ID, version: '1.0.0', manifest: {}, schemaVersion: 0 })
      .run();

    const def = makeLogsModule();
    loader.register(def);
    await loader.loadAll();

    const discord = createDiscordClient({ fetch: fetchImpl });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerUnboundPermissionsRoutes(app, { loader, permissions, discord });

    return { app, permissions };
  };

  it('retourne toutes les permissions du module si aucune n est liée', async () => {
    const { app } = await build(adminFetch);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/${MOD_ID}/unbound-permissions`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { permissions: { id: string }[] };
      expect(body.permissions).toHaveLength(1);
      expect(body.permissions[0]?.id).toBe(MANAGE_PERM);
    } finally {
      await app.close();
    }
  });

  it('retourne [] si toutes les permissions du module sont liées', async () => {
    const { app, permissions } = await build(adminFetch);
    try {
      // La FK `permission_bindings.permissionId` référence `permissions_registry`.
      // On enregistre la permission avant de poser le binding.
      await permissions.registerPermissions([
        {
          id: MANAGE_PERM,
          moduleId: MOD_ID,
          description: 'Configurer les routes de logs.',
          category: 'config',
          defaultLevel: 'admin',
          createdAt: new Date().toISOString() as never,
        },
      ]);
      await permissions.bind(GUILD, MANAGE_PERM, 'role-admin' as never);

      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/${MOD_ID}/unbound-permissions`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { permissions: unknown[] };
      expect(body.permissions).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(adminFetch);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/${MOD_ID}/unbound-permissions`,
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("403 si l'user n'est pas admin de la guild", async () => {
    const { app } = await build(nonAdminFetch);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/${MOD_ID}/unbound-permissions`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('404 si le module est inconnu', async () => {
    const { app } = await build(adminFetch);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/inexistant/unbound-permissions`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
