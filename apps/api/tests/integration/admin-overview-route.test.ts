import {
  createLogger,
  createOwnershipService,
  createPluginLoader,
  type PluginLoader,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  registerAdminOverviewRoutes,
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

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

const buildLoader = (client: DbClient<'sqlite'>): PluginLoader =>
  createPluginLoader({
    client,
    ctxFactory: () => {
      throw new Error('ctxFactory not used in these tests');
    },
    logger: silentLogger(),
  });

interface BuildOptions {
  readonly discordConnected?: boolean;
  readonly discordLatencyMs?: number | null;
}

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  ownership: ReturnType<typeof createOwnershipService>;
  loader: PluginLoader;
}> => {
  const ownership = createOwnershipService({ client });
  const loader = buildLoader(client);
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerAdminOverviewRoutes(app, {
    ownership,
    client,
    loader,
    version: '7.7.7',
    getDiscordStatus: () => ({
      connected: buildOptions.discordConnected ?? false,
      latencyMs: buildOptions.discordLatencyMs ?? null,
    }),
  });
  return { app, ownership, loader };
};

const ownerSession = (userId: string): Record<string, string> => ({
  'x-test-session': JSON.stringify({ userId }),
});

describe('GET /admin/overview', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne la forme attendue avec valeurs par défaut sur instance vierge', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        bot: { connected: boolean; latencyMs: number | null; uptime: number; version: string };
        guilds: { count: number; totalMembers: number | null };
        modules: { installed: number; active: number };
        db: { driver: 'pg' | 'sqlite'; sizeBytes: number | null; lastMigration: string | null };
      };
      expect(body.bot.connected).toBe(false);
      expect(body.bot.latencyMs).toBeNull();
      expect(body.bot.uptime).toBeGreaterThanOrEqual(0);
      expect(body.bot.version).toBe('7.7.7');
      expect(body.guilds.count).toBe(0);
      expect(body.guilds.totalMembers).toBeNull();
      expect(body.modules.installed).toBe(0);
      expect(body.modules.active).toBe(0);
      expect(body.db.driver).toBe('sqlite');
    } finally {
      await app.close();
    }
  });

  it('reflète le statut Discord injecté par getDiscordStatus', async () => {
    const { app, ownership } = await build(client, {
      discordConnected: true,
      discordLatencyMs: 42,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        bot: { connected: boolean; latencyMs: number | null };
      };
      expect(body.bot.connected).toBe(true);
      expect(body.bot.latencyMs).toBe(42);
    } finally {
      await app.close();
    }
  });

  it('compte les guilds enregistrées', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await client.db
        .insert(sqliteSchema.guilds)
        .values([
          { id: '100000000000000001', name: 'Alpha' },
          { id: '100000000000000002', name: 'Beta' },
          { id: '100000000000000003', name: 'Gamma' },
        ])
        .run();

      const res = await app.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: ownerSession('111111111111111111'),
      });
      const body = res.json() as { guilds: { count: number } };
      expect(body.guilds.count).toBe(3);
    } finally {
      await app.close();
    }
  });

  it('compte les modules actifs (sum enabled across guild_modules)', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      // Seed 2 guilds + 1 module + 1 enabled binding.
      await client.db
        .insert(sqliteSchema.guilds)
        .values([
          { id: '100000000000000001', name: 'Alpha' },
          { id: '100000000000000002', name: 'Beta' },
        ])
        .run();
      await client.db
        .insert(sqliteSchema.modulesRegistry)
        .values({
          id: 'mod-x',
          version: '1.0.0',
          manifest: {},
          schemaVersion: 1,
        })
        .run();
      await client.db
        .insert(sqliteSchema.guildModules)
        .values([
          { guildId: '100000000000000001', moduleId: 'mod-x', enabled: true },
          { guildId: '100000000000000002', moduleId: 'mod-x', enabled: false },
        ])
        .run();

      const res = await app.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: ownerSession('111111111111111111'),
      });
      const body = res.json() as { modules: { active: number } };
      expect(body.modules.active).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/admin/overview' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
