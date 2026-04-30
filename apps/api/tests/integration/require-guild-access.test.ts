import type { GuildId } from '@varde/contracts';
import {
  createGuildPermissionsService,
  createLogger,
  type GuildPermissionsContext,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  requireGuildAccess,
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

const GUILD: GuildId = 'guild-1' as GuildId;
const ADMIN_ROLE = 'role-admin';
const MOD_ROLE = 'role-mod';

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  return client;
};

const buildApp = async (
  client: DbClient<'sqlite'>,
  context: GuildPermissionsContext,
): Promise<Awaited<ReturnType<typeof createApiServer>>> => {
  const guildPermissions = createGuildPermissionsService({ client, context });
  await guildPermissions.updateConfig(
    GUILD,
    { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
    { type: 'system' },
  );
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  app.get<{ Params: { level: 'admin' | 'moderator' } }>('/__test/:level', async (request) => {
    const session = await requireGuildAccess(
      app,
      request,
      GUILD,
      guildPermissions,
      request.params.level,
    );
    return { ok: true, userId: session.userId };
  });
  return app;
};

const session = (userId: string): Record<string, string> => ({
  'x-test-session': JSON.stringify({ userId }),
});

describe('requireGuildAccess', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('401 sans session', async () => {
    const app = await buildApp(client, {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => null),
      getUserRoleIds: vi.fn(async () => []),
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/__test/admin' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si user sans rôle d accès (pas 403)', async () => {
    const app = await buildApp(client, {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => null),
      getUserRoleIds: vi.fn(async () => []),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__test/admin',
        headers: session('user-1'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('200 avec session admin pour level admin', async () => {
    const app = await buildApp(client, {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => null),
      getUserRoleIds: vi.fn(async () => [ADMIN_ROLE]),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__test/admin',
        headers: session('user-1'),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('404 si moderator essaye d accéder au level admin', async () => {
    const app = await buildApp(client, {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => null),
      getUserRoleIds: vi.fn(async () => [MOD_ROLE]),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__test/admin',
        headers: session('user-1'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('200 si moderator accède à level moderator', async () => {
    const app = await buildApp(client, {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => null),
      getUserRoleIds: vi.fn(async () => [MOD_ROLE]),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__test/moderator',
        headers: session('user-1'),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('admin peut accéder au level moderator', async () => {
    const app = await buildApp(client, {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => null),
      getUserRoleIds: vi.fn(async () => [ADMIN_ROLE]),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__test/moderator',
        headers: session('user-1'),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('owner Discord du serveur a toujours accès', async () => {
    const app = await buildApp(client, {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => 'owner-id'),
      getUserRoleIds: vi.fn(async () => []),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__test/admin',
        headers: session('owner-id'),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
