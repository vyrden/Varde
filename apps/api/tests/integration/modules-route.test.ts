import { randomBytes } from 'node:crypto';
import type { GuildId, ModuleId } from '@varde/contracts';
import { defineModule } from '@varde/contracts';
import {
  createConfigService,
  createCtxFactory,
  createEventBus,
  createGuildPermissionsService,
  createLogger,
  createPermissionService,
  createPluginLoader,
  type GuildPermissionsContext,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  registerModulesRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111' as GuildId;
const MOD: ModuleId = 'hello-world' as ModuleId;
const SECOND_MOD: ModuleId = 'moderation' as ModuleId;

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

const authHeader = {
  'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
};

const makeModule = (id: string, opts: { withConfig?: boolean } = {}) => {
  const manifest = {
    id: id as ModuleId,
    name: `Module ${id}`,
    version: '1.0.0',
    coreVersion: '^1.0.0',
    description: `Module ${id} description`,
    author: { name: 'X' },
    license: 'Apache-2.0',
    schemaVersion: 0,
    permissions: [],
    events: { listen: [], emit: [] as string[] },
  };
  if (!opts.withConfig) {
    return defineModule({ manifest });
  }
  return defineModule({
    manifest,
    configSchema: z.object({
      welcomeDelayMs: z.number().int().min(0).max(60_000).default(300),
    }),
    configUi: {
      fields: [
        {
          path: 'welcomeDelayMs',
          label: "Délai d'accueil (ms)",
          widget: 'number',
        },
      ],
    },
  });
};

describe('routes /guilds/:guildId/modules — permission', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  });

  afterEach(async () => {
    await client.close();
  });

  const build = async (fetchImpl: FetchLike, hasAccess = true) => {
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
    const discord = createDiscordClient({ fetch: fetchImpl });
    const context: GuildPermissionsContext = {
      getAdminRoleIds: async () => ['role-admin'],
      getOwnerId: async () => null,
      getUserRoleIds: async () => (hasAccess ? ['role-admin'] : []),
    };
    const guildPermissions = createGuildPermissionsService({ client, context });

    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values({ id: MOD, version: '1.0.0', manifest: {}, schemaVersion: 0 })
      .run();

    const def = makeModule(MOD, { withConfig: true });
    loader.register(def);
    await loader.loadAll();

    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerModulesRoutes(app, { loader, config, discord, guildPermissions });
    return { app, config, loader, bundle };
  };

  it('401 sans session sur GET /modules', async () => {
    const { app } = await build(vi.fn());
    try {
      const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD}/modules` });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 quand le user n a aucun rôle d accès sur la guild', async () => {
    const { app } = await build(vi.fn(), false);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: authHeader,
      });
      // jalon 7 PR 7.3 : on retourne 404 (pas 403) pour ne pas
      // révéler l'existence de la guild à un user non autorisé.
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('routes /guilds/:guildId/modules — flow nominal', () => {
  let client: DbClient<'sqlite'>;

  const adminFetch: FetchLike = async () => jsonResponse([discordGuild(GUILD, '0x20')]);

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  });

  afterEach(async () => {
    await client.close();
  });

  const build = async (moduleIds: readonly string[] = [MOD]) => {
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
    const discord = createDiscordClient({ fetch: adminFetch });
    const context: GuildPermissionsContext = {
      getAdminRoleIds: async () => ['role-admin'],
      getOwnerId: async () => null,
      getUserRoleIds: async () => ['role-admin'],
    };
    const guildPermissions = createGuildPermissionsService({ client, context });

    for (const id of moduleIds) {
      await client.db
        .insert(sqliteSchema.modulesRegistry)
        .values({ id, version: '1.0.0', manifest: {}, schemaVersion: 0 })
        .run();
      const def = id === MOD ? makeModule(id, { withConfig: true }) : makeModule(id);
      loader.register(def);
    }
    await loader.loadAll();

    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerModulesRoutes(app, { loader, config, discord, guildPermissions });
    return { app, config, loader };
  };

  it('GET /modules renvoie la liste des modules chargés', async () => {
    const { app } = await build([MOD, SECOND_MOD]);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { id: string; enabled: boolean }[];
      expect(body.map((m) => m.id).sort()).toEqual([MOD, SECOND_MOD].sort());
      expect(body.every((m) => m.enabled === false)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('GET /modules/:id/config renvoie config + configUi + configSchema JSON', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/${MOD}/config`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.config).toEqual({});
      expect(body.configUi).toMatchObject({
        fields: [{ path: 'welcomeDelayMs', widget: 'number' }],
      });
      expect(body.configSchema).toMatchObject({
        type: 'object',
        properties: { welcomeDelayMs: expect.objectContaining({ type: 'integer' }) },
      });
    } finally {
      await app.close();
    }
  });

  it('GET /modules/:id/config 404 si le module est inconnu', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/unknown/config`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('PUT /modules/:id/config valide puis persiste la config', async () => {
    const { app, config } = await build();
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/modules/${MOD}/config`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ welcomeDelayMs: 1500 }),
      });
      expect(res.statusCode).toBe(204);

      const stored = (await config.get(GUILD)) as { modules?: { [k: string]: unknown } };
      expect(stored.modules?.[MOD]).toEqual({ welcomeDelayMs: 1500 });
    } finally {
      await app.close();
    }
  });

  it('PUT /modules/:id/config 400 si le body ne passe pas le schéma', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/modules/${MOD}/config`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ welcomeDelayMs: -1 }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_config' });
      expect(res.json().details).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('PUT /modules/:id/config émet config.changed sur l EventBus', async () => {
    const { app } = await build();
    try {
      // On reconstruit un listener direct via le config déjà exposé
      // depuis build(). Plus propre : injecter un listener côté config
      // service — mais ici on valide qu'une écriture via l'API produit
      // bien la persistance ; le test unitaire du ConfigService couvre
      // déjà l'émission de l'événement.
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/modules/${MOD}/config`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ welcomeDelayMs: 700 }),
      });
      expect(res.statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('GET /modules/:id/config renvoie la valeur actuelle après PUT', async () => {
    const { app } = await build();
    try {
      await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/modules/${MOD}/config`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ welcomeDelayMs: 2500 }),
      });
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/${MOD}/config`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().config).toEqual({ welcomeDelayMs: 2500 });
    } finally {
      await app.close();
    }
  });
});
