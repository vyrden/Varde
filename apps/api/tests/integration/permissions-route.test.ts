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
  type GuildRoleDto,
  type PermissionsMemberSnapshot,
  registerPermissionsRoutes,
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
const ADMIN_ROLE = 'role-admin';
const MOD_ROLE = 'role-mod';
const PARTNER_ROLE = 'role-partner';

const ROLES: GuildRoleDto[] = [
  { id: ADMIN_ROLE, name: 'Admin', position: 10 },
  { id: MOD_ROLE, name: 'Moderator', position: 5 },
  { id: PARTNER_ROLE, name: 'Partner', position: 3 },
];

interface BuildOptions {
  readonly hasAccess?: boolean;
  readonly members?: readonly PermissionsMemberSnapshot[];
}

const auth = (userId: string): Record<string, string> => ({
  'x-test-session': JSON.stringify({ userId }),
});

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  return client;
};

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  guildPermissions: ReturnType<typeof createGuildPermissionsService>;
}> => {
  const hasAccess = buildOptions.hasAccess ?? true;
  const context: GuildPermissionsContext = {
    getAdminRoleIds: async () => [ADMIN_ROLE],
    getOwnerId: async () => null,
    getUserRoleIds: async () => (hasAccess ? [ADMIN_ROLE] : []),
  };
  const guildPermissions = createGuildPermissionsService({ client, context });
  // Pré-pose une config pour ne pas générer le default au premier appel.
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
  registerPermissionsRoutes(app, {
    guildPermissions,
    listGuildRoles: vi.fn(async () => ROLES),
    listGuildMembers: vi.fn(async () => buildOptions.members ?? []),
  });
  return { app, guildPermissions };
};

describe('GET /guilds/:guildId/permissions', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('200 retourne config + roles enrichis', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/permissions`,
        headers: auth('user-1'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        adminRoleIds: [ADMIN_ROLE],
        moderatorRoleIds: [MOD_ROLE],
        roles: expect.arrayContaining([expect.objectContaining({ id: ADMIN_ROLE, name: 'Admin' })]),
      });
    } finally {
      await app.close();
    }
  });

  it('404 si user sans accès admin', async () => {
    const { app } = await build(client, { hasAccess: false });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/permissions`,
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
      const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD}/permissions` });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /guilds/:guildId/permissions', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('200 persiste la nouvelle config et retourne les roles', async () => {
    const { app, guildPermissions } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/permissions`,
        headers: auth('user-1'),
        payload: { adminRoleIds: [ADMIN_ROLE, PARTNER_ROLE], moderatorRoleIds: [MOD_ROLE] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.adminRoleIds).toEqual([ADMIN_ROLE, PARTNER_ROLE]);
      const persisted = await guildPermissions.getConfig(GUILD);
      expect(persisted.adminRoleIds).toEqual([ADMIN_ROLE, PARTNER_ROLE]);
    } finally {
      await app.close();
    }
  });

  it('422 unknown_role_ids quand un id n existe pas sur la guild', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/permissions`,
        headers: auth('user-1'),
        payload: { adminRoleIds: ['unknown-role'], moderatorRoleIds: [] },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ error: 'unknown_role_ids' });
    } finally {
      await app.close();
    }
  });

  it('422 sur liste admin vide (validation côté service)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/permissions`,
        headers: auth('user-1'),
        payload: { adminRoleIds: [], moderatorRoleIds: [MOD_ROLE] },
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });

  it('422 sur même role dans admin et moderator (validation service)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/permissions`,
        headers: auth('user-1'),
        payload: { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [ADMIN_ROLE] },
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });

  it('404 si user sans accès admin', async () => {
    const { app } = await build(client, { hasAccess: false });
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/permissions`,
        headers: auth('user-1'),
        payload: { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [] },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('POST /guilds/:guildId/permissions/preview', () => {
  let client: DbClient<'sqlite'>;
  beforeEach(async () => {
    client = await setupClient();
  });
  afterEach(async () => {
    await client.close();
  });

  it('200 buckets les members par niveau selon le patch', async () => {
    const members: PermissionsMemberSnapshot[] = [
      { id: 'u1', username: 'Alice', roleIds: [ADMIN_ROLE] },
      { id: 'u2', username: 'Bob', roleIds: [MOD_ROLE] },
      { id: 'u3', username: 'Carol', roleIds: [PARTNER_ROLE] },
      { id: 'u4', username: 'Dan', roleIds: [ADMIN_ROLE, MOD_ROLE] },
    ];
    const { app } = await build(client, { members });
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/permissions/preview`,
        headers: auth('user-1'),
        payload: { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        admins: { id: string }[];
        moderators: { id: string }[];
      };
      expect(body.admins.map((m) => m.id).sort()).toEqual(['u1', 'u4']);
      expect(body.moderators.map((m) => m.id)).toEqual(['u2']);
    } finally {
      await app.close();
    }
  });

  it('422 si un role inconnu est dans le patch', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/permissions/preview`,
        headers: auth('user-1'),
        payload: { adminRoleIds: ['unknown'], moderatorRoleIds: [] },
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });

  it('404 si user sans accès admin', async () => {
    const { app } = await build(client, { hasAccess: false });
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/permissions/preview`,
        headers: auth('user-1'),
        payload: { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [] },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
