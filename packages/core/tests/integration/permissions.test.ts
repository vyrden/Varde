import type {
  GuildId,
  ModuleId,
  PermissionId,
  PermissionRegistryRecord,
  RoleId,
  UserId,
} from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPermissionService,
  type MemberContextResolver,
  type PermissionContext,
} from '../../src/permissions.js';

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const MODERATOR_ROLE: RoleId = 'r-mod' as RoleId;
const MEMBER_ROLE: RoleId = 'r-member' as RoleId;
const MODERATION: ModuleId = 'moderation' as ModuleId;
const WELCOME: ModuleId = 'welcome' as ModuleId;
const BAN_PERMISSION: PermissionId = 'moderation.ban' as PermissionId;
const GREET_PERMISSION: PermissionId = 'welcome.greet' as PermissionId;

const seed = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  await client.db
    .insert(sqliteSchema.modulesRegistry)
    .values([
      { id: MODERATION, version: '1.0.0', manifest: {}, schemaVersion: 1 },
      { id: WELCOME, version: '1.0.0', manifest: {}, schemaVersion: 1 },
    ])
    .run();
};

const staticResolver =
  (ctx: PermissionContext | null): MemberContextResolver =>
  async () =>
    ctx;

describe('createPermissionService — acteur system', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('autorise toujours un acteur system', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver(null),
    });
    const result = await permissions.can({ type: 'system' }, BAN_PERMISSION);
    expect(result).toBe(true);
  });
});

describe('createPermissionService — acteur module', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('autorise un module sur ses propres permissions', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver(null),
    });
    expect(await permissions.can({ type: 'module', id: MODERATION }, BAN_PERMISSION)).toBe(true);
  });

  it('refuse un module qui réclame une permission d un autre module', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver(null),
    });
    expect(await permissions.can({ type: 'module', id: WELCOME }, BAN_PERMISSION)).toBe(false);
  });
});

describe('createPermissionService — acteur user', () => {
  let client: DbClient<'sqlite'>;

  const insertPermissionsRegistry = async (): Promise<void> => {
    await client.db
      .insert(sqliteSchema.permissionsRegistry)
      .values([
        {
          id: BAN_PERMISSION,
          moduleId: MODERATION,
          description: 'Bannir un user',
          category: 'moderation',
          defaultLevel: 'moderator',
        },
        {
          id: GREET_PERMISSION,
          moduleId: WELCOME,
          description: 'Envoyer un message d accueil',
          category: 'welcome',
          defaultLevel: 'member',
        },
      ])
      .run();
  };

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    await insertPermissionsRegistry();
  });

  afterEach(async () => {
    await client.close();
  });

  it("refuse si le contexte Discord n'est pas résolu (user absent de la guild)", async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver(null),
    });
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      false,
    );
  });

  it('bypass owner : toujours autorisé même sans binding', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [],
        isOwner: true,
        isAdministrator: false,
      }),
    });
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      true,
    );
  });

  it('bypass Administrator par défaut', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [],
        isOwner: false,
        isAdministrator: true,
      }),
    });
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      true,
    );
  });

  it('bypass Administrator désactivé', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [],
        isOwner: false,
        isAdministrator: true,
      }),
      bypassAdministrator: false,
    });
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      false,
    );
  });

  it('autorise un user qui porte un rôle lié à la permission', async () => {
    await client.db
      .insert(sqliteSchema.permissionBindings)
      .values({ guildId: GUILD, permissionId: BAN_PERMISSION, roleId: MODERATOR_ROLE })
      .run();
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [MODERATOR_ROLE, MEMBER_ROLE],
        isOwner: false,
        isAdministrator: false,
      }),
    });
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      true,
    );
  });

  it("refuse un user dont aucun rôle n'est lié", async () => {
    await client.db
      .insert(sqliteSchema.permissionBindings)
      .values({ guildId: GUILD, permissionId: BAN_PERMISSION, roleId: MODERATOR_ROLE })
      .run();
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [MEMBER_ROLE],
        isOwner: false,
        isAdministrator: false,
      }),
    });
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      false,
    );
  });

  it('cache le binding et l invalidate force un rechargement', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [MODERATOR_ROLE],
        isOwner: false,
        isAdministrator: false,
      }),
    });
    // Première lecture : rien dans permission_bindings → false.
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      false,
    );

    // On ajoute le binding après que le cache a été peuplé.
    await client.db
      .insert(sqliteSchema.permissionBindings)
      .values({ guildId: GUILD, permissionId: BAN_PERMISSION, roleId: MODERATOR_ROLE })
      .run();

    // Tant qu'on n'invalide pas, le cache répond encore false.
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      false,
    );

    // Après invalidate, la lecture refait un tour DB et voit le binding.
    permissions.invalidate(GUILD);
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      true,
    );
  });
});

describe('createPermissionService — registerPermissions', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('upsert les permissions dans permissions_registry', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver(null),
    });

    const records: readonly PermissionRegistryRecord[] = [
      {
        id: BAN_PERMISSION,
        moduleId: MODERATION,
        description: 'Bannir un user',
        category: 'moderation',
        defaultLevel: 'moderator',
        createdAt: '2026-01-01T00:00:00.000Z' as never,
      },
    ];
    await permissions.registerPermissions(records);
    await permissions.registerPermissions([{ ...records[0], description: 'Kick ou ban' } as never]);

    const rows = await client.db.select().from(sqliteSchema.permissionsRegistry).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe('Kick ou ban');
  });
});

describe('createPermissionService — can sans guild', () => {
  it('refuse un acteur user via can() (pas de guildId — utiliser canInGuild)', async () => {
    const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    try {
      await applyMigrations(client);
      const permissions = createPermissionService({
        client,
        resolveMemberContext: staticResolver({
          roles: [],
          isOwner: true,
          isAdministrator: true,
        }),
      });
      expect(await permissions.can({ type: 'user', id: USER }, BAN_PERMISSION)).toBe(false);
    } finally {
      await client.close();
    }
  });
});

describe('createPermissionService — bind / unbind', () => {
  let client: DbClient<'sqlite'>;

  const insertPermissionsRegistry = async (): Promise<void> => {
    await client.db
      .insert(sqliteSchema.permissionsRegistry)
      .values([
        {
          id: BAN_PERMISSION,
          moduleId: MODERATION,
          description: 'Bannir un user',
          category: 'moderation',
          defaultLevel: 'moderator',
        },
        {
          id: GREET_PERMISSION,
          moduleId: WELCOME,
          description: 'Envoyer un message d accueil',
          category: 'welcome',
          defaultLevel: 'member',
        },
      ])
      .run();
  };

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    await insertPermissionsRegistry();
  });

  afterEach(async () => {
    await client.close();
  });

  it('bind ajoute une ligne et rend la permission résolvable pour un user portant le rôle', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [MODERATOR_ROLE],
        isOwner: false,
        isAdministrator: false,
      }),
    });

    // Avant bind : refus.
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      false,
    );

    await permissions.bind(GUILD, BAN_PERMISSION, MODERATOR_ROLE);

    // Après bind : autorisation.
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      true,
    );
  });

  it('bind deux fois avec le même (permission, role) est idempotent', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [MODERATOR_ROLE],
        isOwner: false,
        isAdministrator: false,
      }),
    });

    await permissions.bind(GUILD, BAN_PERMISSION, MODERATOR_ROLE);
    // Deuxième appel identique : ne doit pas lever d'erreur ni créer de doublon.
    await expect(permissions.bind(GUILD, BAN_PERMISSION, MODERATOR_ROLE)).resolves.toBeUndefined();

    const rows = await client.db
      .select()
      .from(sqliteSchema.permissionBindings)
      .all();
    const matching = rows.filter(
      (r) =>
        r.guildId === GUILD &&
        r.permissionId === BAN_PERMISSION &&
        r.roleId === MODERATOR_ROLE,
    );
    expect(matching).toHaveLength(1);
  });

  it('unbind supprime uniquement la ligne exacte, les autres restent actives', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver({
        roles: [MEMBER_ROLE],
        isOwner: false,
        isAdministrator: false,
      }),
    });

    // Lier la même permission à deux rôles distincts.
    await permissions.bind(GUILD, BAN_PERMISSION, MODERATOR_ROLE);
    await permissions.bind(GUILD, BAN_PERMISSION, MEMBER_ROLE);

    // Supprimer uniquement le binding MODERATOR_ROLE.
    await permissions.unbind(GUILD, BAN_PERMISSION, MODERATOR_ROLE);

    // MEMBER_ROLE est toujours lié → le user (portant MEMBER_ROLE) reste autorisé.
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, BAN_PERMISSION)).toBe(
      true,
    );

    // Vérification directe en DB : seul MEMBER_ROLE subsiste.
    const rows = await client.db
      .select()
      .from(sqliteSchema.permissionBindings)
      .all();
    const remaining = rows.filter(
      (r) => r.guildId === GUILD && r.permissionId === BAN_PERMISSION,
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.roleId).toBe(MEMBER_ROLE);
  });

  it('unbind sur une ligne inexistante ne throw pas', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: staticResolver(null),
    });

    await expect(
      permissions.unbind(GUILD, BAN_PERMISSION, MODERATOR_ROLE),
    ).resolves.toBeUndefined();
  });
});
