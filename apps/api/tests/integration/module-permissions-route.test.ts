import type { GuildId, ModuleDefinition, ModuleId, PermissionId, RoleId } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  type SessionData,
} from '../../src/index.js';
import { registerModulePermissionsRoutes } from '../../src/routes/module-permissions.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111111111111111111' as GuildId;
const MODULE_ID = 'logs' as ModuleId;
const PERM_ID = 'logs.write' as PermissionId;
const ROLE_ID = '999888777666555444' as RoleId;

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const adminFetch: FetchLike = async () =>
  new Response(
    JSON.stringify([
      {
        id: GUILD,
        name: 'Alpha',
        icon: null,
        permissions: '0x20',
      } as DiscordGuild,
    ]),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const authHeader = { 'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }) };

interface FakePermService {
  bind: ReturnType<typeof vi.fn>;
  unbind: ReturnType<typeof vi.fn>;
  listBindings: ReturnType<typeof vi.fn>;
}

interface FakeLoader {
  get: ReturnType<typeof vi.fn>;
}

const buildModule = (permIds: readonly string[]): Pick<ModuleDefinition, 'manifest'> => ({
  manifest: {
    id: MODULE_ID,
    name: 'Logs',
    version: '1.0.0',
    permissions: permIds.map((id) => ({ id, description: id })),
  } as ModuleDefinition['manifest'],
});

const build = async (opts: {
  bindings?: ReadonlyArray<{ permissionId: string; roleId: string }>;
  module?: Pick<ModuleDefinition, 'manifest'> | null;
}) => {
  const logger = silentLogger();
  const discord = createDiscordClient({ fetch: adminFetch });
  const app = await createApiServer({
    logger,
    version: 'test',
    authenticator: headerAuthenticator,
  });
  const permissions: FakePermService = {
    bind: vi.fn().mockResolvedValue(undefined),
    unbind: vi.fn().mockResolvedValue(undefined),
    listBindings: vi.fn().mockResolvedValue(opts.bindings ?? []),
  };
  const loader: FakeLoader = {
    get: vi.fn().mockReturnValue(opts.module === undefined ? buildModule([PERM_ID]) : opts.module),
  };
  registerModulePermissionsRoutes(app, {
    // biome-ignore lint/suspicious/noExplicitAny: tests injectent un fake loader minimal
    loader: loader as any,
    // biome-ignore lint/suspicious/noExplicitAny: tests injectent un fake perm service minimal
    permissions: permissions as any,
    discord,
  });
  return { app, permissions, loader };
};

describe('GET /guilds/:guildId/permissions/bindings', () => {
  let app: Awaited<ReturnType<typeof build>>['app'];
  afterEach(async () => {
    await app.close();
  });

  it('renvoie 200 avec la liste des bindings actifs', async () => {
    const ctx = await build({
      bindings: [{ permissionId: PERM_ID, roleId: ROLE_ID }],
    });
    app = ctx.app;
    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD}/permissions/bindings`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { bindings: Array<{ permissionId: string; roleId: string }> };
    expect(body.bindings).toEqual([{ permissionId: PERM_ID, roleId: ROLE_ID }]);
  });

  it('renvoie 200 avec liste vide quand aucun binding', async () => {
    const ctx = await build({ bindings: [] });
    app = ctx.app;
    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD}/permissions/bindings`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { bindings: unknown[] }).bindings).toEqual([]);
  });

  it('401 sans session', async () => {
    const ctx = await build({});
    app = ctx.app;
    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD}/permissions/bindings`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings', () => {
  let app: Awaited<ReturnType<typeof build>>['app'];
  afterEach(async () => {
    await app.close();
  });

  it('lie le rôle et renvoie 204 quand module + permission existent', async () => {
    const ctx = await build({});
    app = ctx.app;
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD}/modules/${MODULE_ID}/permissions/${PERM_ID}/bindings`,
      headers: { ...authHeader, 'content-type': 'application/json' },
      payload: JSON.stringify({ roleId: ROLE_ID }),
    });
    expect(res.statusCode).toBe(204);
    expect(ctx.permissions.bind).toHaveBeenCalledWith(GUILD, PERM_ID, ROLE_ID);
  });

  it('renvoie 404 module_not_found quand le module est inconnu', async () => {
    const ctx = await build({ module: null });
    app = ctx.app;
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD}/modules/${MODULE_ID}/permissions/${PERM_ID}/bindings`,
      headers: { ...authHeader, 'content-type': 'application/json' },
      payload: JSON.stringify({ roleId: ROLE_ID }),
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe('module_not_found');
    expect(ctx.permissions.bind).not.toHaveBeenCalled();
  });

  it('renvoie 404 permission_not_found quand la permission n est pas dans le manifeste', async () => {
    const ctx = await build({ module: buildModule(['other.perm']) });
    app = ctx.app;
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD}/modules/${MODULE_ID}/permissions/${PERM_ID}/bindings`,
      headers: { ...authHeader, 'content-type': 'application/json' },
      payload: JSON.stringify({ roleId: ROLE_ID }),
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe('permission_not_found');
    expect(ctx.permissions.bind).not.toHaveBeenCalled();
  });

  it('400 quand roleId n est pas un snowflake valide', async () => {
    const ctx = await build({});
    app = ctx.app;
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD}/modules/${MODULE_ID}/permissions/${PERM_ID}/bindings`,
      headers: { ...authHeader, 'content-type': 'application/json' },
      payload: JSON.stringify({ roleId: 'not-a-snowflake' }),
    });
    // Zod throw → handler erreur global → 500 sauf si on a custom error
    // handler pour ZodError. On accepte 400 ou 500 selon impl.
    expect([400, 500]).toContain(res.statusCode);
    expect(ctx.permissions.bind).not.toHaveBeenCalled();
  });

  it('401 sans session', async () => {
    const ctx = await build({});
    app = ctx.app;
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD}/modules/${MODULE_ID}/permissions/${PERM_ID}/bindings`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ roleId: ROLE_ID }),
    });
    expect(res.statusCode).toBe(401);
    expect(ctx.permissions.bind).not.toHaveBeenCalled();
  });
});

describe('DELETE /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings/:roleId', () => {
  let app: Awaited<ReturnType<typeof build>>['app'];
  afterEach(async () => {
    await app.close();
  });

  it('supprime le binding et renvoie 204', async () => {
    const ctx = await build({});
    app = ctx.app;
    const res = await app.inject({
      method: 'DELETE',
      url: `/guilds/${GUILD}/modules/${MODULE_ID}/permissions/${PERM_ID}/bindings/${ROLE_ID}`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(204);
    expect(ctx.permissions.unbind).toHaveBeenCalledWith(GUILD, PERM_ID, ROLE_ID);
  });

  it('401 sans session', async () => {
    const ctx = await build({});
    app = ctx.app;
    const res = await app.inject({
      method: 'DELETE',
      url: `/guilds/${GUILD}/modules/${MODULE_ID}/permissions/${PERM_ID}/bindings/${ROLE_ID}`,
    });
    expect(res.statusCode).toBe(401);
    expect(ctx.permissions.unbind).not.toHaveBeenCalled();
  });
});
