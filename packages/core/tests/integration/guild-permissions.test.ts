import type { GuildId, UserId } from '@varde/contracts';
import { ValidationError } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGuildPermissionsService,
  type GuildPermissionsContext,
} from '../../src/guild-permissions.js';

const GUILD: GuildId = '111' as GuildId;
const OWNER: UserId = '900' as UserId;
const ADMIN_USER: UserId = '901' as UserId;
const MOD_USER: UserId = '902' as UserId;
const RANDOM_USER: UserId = '903' as UserId;

const ADMIN_ROLE = 'role-admin';
const MOD_ROLE = 'role-mod';
const PARTNER_ROLE = 'role-partner';

const seed = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
};

const buildContext = (): GuildPermissionsContext => ({
  getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
  getOwnerId: vi.fn(async () => OWNER),
  getUserRoleIds: vi.fn(async (_g, userId) => {
    if (userId === ADMIN_USER) return [ADMIN_ROLE];
    if (userId === MOD_USER) return [MOD_ROLE];
    return [];
  }),
});

describe('guildPermissionsService — getConfig', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('génère + persiste le défaut quand pas de config en DB', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    const config = await service.getConfig(GUILD);
    expect(config.adminRoleIds).toEqual([ADMIN_ROLE]);
    expect(config.moderatorRoleIds).toEqual([]);
    // Lecture suivante : la même valeur est servie depuis la DB
    // (les calls suivants ne devraient pas re-tirer le défaut).
    const ctxSpy: GuildPermissionsContext = {
      getAdminRoleIds: vi.fn(async () => ['SHOULD_NOT_BE_CALLED']),
      getOwnerId: vi.fn(async () => OWNER),
      getUserRoleIds: vi.fn(async () => []),
    };
    const refetchService = createGuildPermissionsService({ client, context: ctxSpy });
    const refetched = await refetchService.getConfig(GUILD);
    expect(refetched.adminRoleIds).toEqual([ADMIN_ROLE]);
    expect(ctxSpy.getAdminRoleIds).not.toHaveBeenCalled();
  });

  it('retourne le défaut éphémère (non persisté) si pas de role admin Discord', async () => {
    const ctx: GuildPermissionsContext = {
      getAdminRoleIds: vi.fn(async () => []),
      getOwnerId: vi.fn(async () => OWNER),
      getUserRoleIds: vi.fn(async () => []),
    };
    const service = createGuildPermissionsService({ client, context: ctx });
    const config = await service.getConfig(GUILD);
    expect(config.adminRoleIds).toEqual([]);
    expect(config.moderatorRoleIds).toEqual([]);
    const rows = await client.db.select().from(sqliteSchema.guildPermissions).all();
    expect(rows).toHaveLength(0);
  });
});

describe('guildPermissionsService — updateConfig', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('persiste et retourne la config mise à jour', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    const result = await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE, PARTNER_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(result.adminRoleIds).toEqual([ADMIN_ROLE, PARTNER_ROLE]);
    expect(result.moderatorRoleIds).toEqual([MOD_ROLE]);
    const refetched = await service.getConfig(GUILD);
    expect(refetched).toEqual(result);
  });

  it('refuse une liste admin vide', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await expect(
      service.updateConfig(
        GUILD,
        { adminRoleIds: [], moderatorRoleIds: [MOD_ROLE] },
        { type: 'user', id: OWNER },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuse un même role dans admin et moderator', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await expect(
      service.updateConfig(
        GUILD,
        { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [ADMIN_ROLE] },
        { type: 'user', id: OWNER },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuse les doublons internes', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await expect(
      service.updateConfig(
        GUILD,
        { adminRoleIds: [ADMIN_ROLE, ADMIN_ROLE], moderatorRoleIds: [] },
        { type: 'user', id: OWNER },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('guildPermissionsService — getUserLevel', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('owner du serveur → admin (même sans rôle dans la liste)', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    expect(await service.getUserLevel(GUILD, OWNER)).toBe('admin');
  });

  it('user avec un rôle admin → admin', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(await service.getUserLevel(GUILD, ADMIN_USER)).toBe('admin');
  });

  it('user avec un rôle moderator → moderator', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(await service.getUserLevel(GUILD, MOD_USER)).toBe('moderator');
  });

  it('user sans rôle d accès → null', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(await service.getUserLevel(GUILD, RANDOM_USER)).toBeNull();
  });

  it('admin a précédence sur moderator si user a les deux rôles', async () => {
    const ctx: GuildPermissionsContext = {
      getAdminRoleIds: vi.fn(async () => [ADMIN_ROLE]),
      getOwnerId: vi.fn(async () => OWNER),
      getUserRoleIds: vi.fn(async () => [ADMIN_ROLE, MOD_ROLE]),
    };
    const service = createGuildPermissionsService({ client, context: ctx });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(await service.getUserLevel(GUILD, ADMIN_USER)).toBe('admin');
  });
});

describe('guildPermissionsService — canAccessModule', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('admin peut accéder à tout', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(await service.canAccessModule(GUILD, ADMIN_USER, 'admin')).toBe(true);
    expect(await service.canAccessModule(GUILD, ADMIN_USER, 'moderator')).toBe(true);
  });

  it('moderator accède aux modules moderator mais pas aux admin-only', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(await service.canAccessModule(GUILD, MOD_USER, 'admin')).toBe(false);
    expect(await service.canAccessModule(GUILD, MOD_USER, 'moderator')).toBe(true);
  });

  it('user sans rôle → false sur tous les niveaux', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    expect(await service.canAccessModule(GUILD, RANDOM_USER, 'admin')).toBe(false);
    expect(await service.canAccessModule(GUILD, RANDOM_USER, 'moderator')).toBe(false);
  });
});

describe('guildPermissionsService — cleanupDeletedRole', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('retire un role admin de la liste, en laissant la moderator intacte', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE, PARTNER_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    await service.cleanupDeletedRole(GUILD, PARTNER_ROLE);
    const config = await service.getConfig(GUILD);
    expect(config.adminRoleIds).toEqual([ADMIN_ROLE]);
    expect(config.moderatorRoleIds).toEqual([MOD_ROLE]);
  });

  it('regénère le défaut si la liste admin devient vide', async () => {
    // Setup : 1 seul role admin (ADMIN_ROLE) — qu'on s'apprête à supprimer.
    const fallbackRoles: string[] = ['fallback-admin'];
    const ctx: GuildPermissionsContext = {
      getAdminRoleIds: vi.fn(async () => fallbackRoles),
      getOwnerId: vi.fn(async () => OWNER),
      getUserRoleIds: vi.fn(async () => []),
    };
    const service = createGuildPermissionsService({ client, context: ctx });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [] },
      { type: 'user', id: OWNER },
    );
    await service.cleanupDeletedRole(GUILD, ADMIN_ROLE);
    const config = await service.getConfig(GUILD);
    expect(config.adminRoleIds).toEqual(fallbackRoles);
  });

  it('no-op si pas de config persistée', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.cleanupDeletedRole(GUILD, ADMIN_ROLE);
    const rows = await client.db.select().from(sqliteSchema.guildPermissions).all();
    expect(rows).toHaveLength(0);
  });

  it('no-op si le role n est dans aucune liste', async () => {
    const service = createGuildPermissionsService({ client, context: buildContext() });
    await service.updateConfig(
      GUILD,
      { adminRoleIds: [ADMIN_ROLE], moderatorRoleIds: [MOD_ROLE] },
      { type: 'user', id: OWNER },
    );
    await service.cleanupDeletedRole(GUILD, 'unknown-role');
    const config = await service.getConfig(GUILD);
    expect(config.adminRoleIds).toEqual([ADMIN_ROLE]);
    expect(config.moderatorRoleIds).toEqual([MOD_ROLE]);
  });
});
