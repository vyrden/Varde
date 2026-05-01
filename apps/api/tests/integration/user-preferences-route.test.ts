import type { GuildId } from '@varde/contracts';
import {
  createGuildPermissionsService,
  createLogger,
  createUserPreferencesService,
  type GuildPermissionsContext,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  registerUserPreferencesRoutes,
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
const KNOWN_MODULES = ['moderation', 'welcome', 'logs', 'reaction-roles'] as const;

interface BuildOptions {
  readonly hasGuildAccess?: boolean;
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
): Promise<{ app: Awaited<ReturnType<typeof createApiServer>> }> => {
  const hasGuildAccess = buildOptions.hasGuildAccess ?? true;
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
  const userPreferences = createUserPreferencesService({ client });

  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerUserPreferencesRoutes(app, {
    userPreferences,
    guildPermissions,
    listKnownModuleIds: () => KNOWN_MODULES,
  });
  return { app };
};

describe('GET /me/preferences', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it("200 retourne les défauts si l'utilisateur n'a rien saisi", async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/me/preferences',
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ theme: 'system', locale: 'fr' });
    } finally {
      await app.close();
    }
  });

  it('200 retourne les valeurs persistées', async () => {
    const { app } = await build(client);
    try {
      await app.inject({
        method: 'PUT',
        url: '/me/preferences',
        headers: auth('user-1'),
        payload: { theme: 'dark', locale: 'en' },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/me/preferences',
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ theme: 'dark', locale: 'en' });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/me/preferences' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /me/preferences', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('200 accepte un patch theme seul', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/me/preferences',
        headers: auth('user-1'),
        payload: { theme: 'dark' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ theme: 'dark', locale: 'fr' });
    } finally {
      await app.close();
    }
  });

  it('400 si body absent ou invalide', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/me/preferences',
        headers: auth('user-1'),
        payload: { theme: 'rainbow' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("200 sur un body vide (no-op, retourne l'état actuel)", async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/me/preferences',
        headers: auth('user-1'),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ theme: 'system', locale: 'fr' });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'PUT', url: '/me/preferences', payload: {} });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('GET /me/guilds/:guildId/preferences', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('200 pinnedModules vide si rien épinglé', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/me/guilds/${GUILD}/preferences`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ pinnedModules: [] });
    } finally {
      await app.close();
    }
  });

  it('404 si user sans accès à la guild', async () => {
    const { app } = await build(client, { hasGuildAccess: false });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/me/guilds/${GUILD}/preferences`,
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
      const res = await app.inject({ method: 'GET', url: `/me/guilds/${GUILD}/preferences` });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /me/guilds/:guildId/preferences/pins', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('200 persiste les pins valides', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/guilds/${GUILD}/preferences/pins`,
        headers: auth('user-1'),
        payload: {
          pinnedModules: [
            { moduleId: 'moderation', position: 0 },
            { moduleId: 'welcome', position: 1 },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        pinnedModules: [
          { moduleId: 'moderation', position: 0 },
          { moduleId: 'welcome', position: 1 },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('422 si > 8 pins', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/guilds/${GUILD}/preferences/pins`,
        headers: auth('user-1'),
        payload: {
          pinnedModules: Array.from({ length: 9 }, (_, i) => ({
            moduleId: `module-${i}`,
            position: i,
          })),
        },
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });

  it('422 si un moduleId est inconnu sur cette instance', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/guilds/${GUILD}/preferences/pins`,
        headers: auth('user-1'),
        payload: {
          pinnedModules: [{ moduleId: 'inexistant', position: 0 }],
        },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('unknown_module_ids');
    } finally {
      await app.close();
    }
  });

  it('400 si body invalide (position négative)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/guilds/${GUILD}/preferences/pins`,
        headers: auth('user-1'),
        payload: {
          pinnedModules: [{ moduleId: 'moderation', position: -1 }],
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('404 si pas accès à la guild', async () => {
    const { app } = await build(client, { hasGuildAccess: false });
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/guilds/${GUILD}/preferences/pins`,
        headers: auth('user-1'),
        payload: { pinnedModules: [] },
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
        method: 'PUT',
        url: `/me/guilds/${GUILD}/preferences/pins`,
        payload: { pinnedModules: [] },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
