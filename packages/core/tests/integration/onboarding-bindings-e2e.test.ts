/**
 * Test d'intégration bout en bout : executor + core.bindPermission + PermissionService.
 *
 * Vérifie que l'application d'un preset avec `core.createRole` suivi de
 * `core.bindPermission` :
 *   1. pose effectivement une ligne dans `permission_bindings` (bon guildId,
 *      permissionId, et snowflake du rôle créé par Discord — pas le localId) ;
 *   2. rend la permission résolvable via `PermissionService.canInGuild` pour
 *      un user portant le rôle.
 *
 * Ce test couvre la chaîne :
 *   executor.applyActions → core.createRole → core.bindPermission
 *   → permissions.bind (guildId-scoped) → permission_bindings en DB
 *   → canInGuild retourne true.
 *
 * Limitation documentée : le Discord adapter est un mock — on ne valide
 * pas le round-trip avec un vrai bot. Ce bout du bout (bot réel ↔ DB)
 * sera couvert par les modules consommateurs (PR 4.1c et suivants).
 */

import type {
  GuildId,
  ModuleId,
  OnboardingActionContext,
  OnboardingSessionId,
  PermissionId,
  RoleId,
  UserId,
} from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '../../src/logger.js';
import { CORE_ACTIONS } from '../../src/onboarding/actions.js';
import { createOnboardingExecutor } from '../../src/onboarding/executor.js';
import { createPermissionService } from '../../src/permissions.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '999' as GuildId;
const USER: UserId = '77' as UserId;
const MODULE_ID: ModuleId = 'test.module' as ModuleId;
const PERMISSION_ID: PermissionId = 'test.module.moderate' as PermissionId;
const SESSION: OnboardingSessionId = '01HZ0BINDINGE2E000000000001' as OnboardingSessionId;

/** Snowflake fictif retourné par le mock Discord pour le rôle créé. */
const MOCK_ROLE_SNOWFLAKE = 'discord-snowflake-mod-role';

/**
 * Construit un `OnboardingActionContext` minimal qui relie le
 * `PermissionService` concret au champ `ctx.permissions`.
 * Discord est mocké : `createRole` retourne un snowflake prévisible.
 */
const buildCtx = (
  permBind: (permissionId: string, roleId: string) => Promise<void>,
  permUnbind: (permissionId: string, roleId: string) => Promise<void>,
): OnboardingActionContext => ({
  guildId: GUILD,
  actorId: USER,
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
  discord: {
    createRole: async () => ({ id: MOCK_ROLE_SNOWFLAKE }),
    deleteRole: async () => undefined,
    createCategory: async () => ({ id: 'cat-1' }),
    deleteCategory: async () => undefined,
    createChannel: async () => ({ id: 'chan-1' }),
    deleteChannel: async () => undefined,
  },
  configPatch: async () => undefined,
  resolveLocalId: () => null,
  permissions: {
    bind: permBind,
    unbind: permUnbind,
  },
});

describe('onboarding : application des permissionBindings de bout en bout', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);

    // Seed : guild + module + permission dans le registre.
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'TestGuild' }).run();
    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values({ id: MODULE_ID, version: '1.0.0', manifest: {}, schemaVersion: 0 })
      .run();
    await client.db
      .insert(sqliteSchema.permissionsRegistry)
      .values({
        id: PERMISSION_ID,
        moduleId: MODULE_ID,
        description: 'Permission de test pour le binding e2e',
        category: 'moderation',
        defaultLevel: 'moderator',
      })
      .run();

    // Seed session d'onboarding en status applying.
    await client.db
      .insert(sqliteSchema.onboardingSessions)
      .values({
        id: SESSION,
        guildId: GUILD,
        startedBy: USER,
        status: 'applying',
        presetSource: 'blank',
      })
      .run();
  });

  afterEach(async () => {
    await client.close();
  });

  it('crée la ligne permission_bindings avec le snowflake Discord, non le localId', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: async () => null,
    });

    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    for (const action of CORE_ACTIONS) {
      exec.registerAction(action);
    }

    // Contexte pré-scopé : bind/unbind reçoivent (permissionId, roleId)
    // et délèguent au service avec le guildId fixé par ce test.
    const ctx = buildCtx(
      (permissionId, roleId) =>
        permissions.bind(GUILD, permissionId as PermissionId, roleId as RoleId),
      (permissionId, roleId) =>
        permissions.unbind(GUILD, permissionId as PermissionId, roleId as RoleId),
    );

    const result = await exec.applyActions(
      SESSION,
      [
        // Action 1 : crée un rôle Discord ; retourne snowflake stocké sous localId 'role-mod'.
        { type: 'core.createRole', payload: { name: 'Modérateur' }, localId: 'role-mod' },
        // Action 2 : lie la permission au rôle via le localId.
        {
          type: 'core.bindPermission',
          payload: { permissionId: PERMISSION_ID, roleLocalId: 'role-mod' },
        },
      ],
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.appliedCount).toBe(2);

    // Vérification directe en DB : la ligne doit exister avec le snowflake, pas 'role-mod'.
    const rows = await client.db.select().from(sqliteSchema.permissionBindings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      guildId: GUILD,
      permissionId: PERMISSION_ID,
      roleId: MOCK_ROLE_SNOWFLAKE,
    });
  });

  it('canInGuild retourne true pour un user portant le rôle lié après apply', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: async () => ({
        // Le user porte le rôle dont le snowflake a été créé par le mock Discord.
        roles: [MOCK_ROLE_SNOWFLAKE as RoleId],
        isOwner: false,
        isAdministrator: false,
      }),
    });

    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    for (const action of CORE_ACTIONS) {
      exec.registerAction(action);
    }

    const ctx = buildCtx(
      (permissionId, roleId) =>
        permissions.bind(GUILD, permissionId as PermissionId, roleId as RoleId),
      (permissionId, roleId) =>
        permissions.unbind(GUILD, permissionId as PermissionId, roleId as RoleId),
    );

    // Avant apply : pas de binding → accès refusé.
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, PERMISSION_ID)).toBe(
      false,
    );

    await exec.applyActions(
      SESSION,
      [
        { type: 'core.createRole', payload: { name: 'Modérateur' }, localId: 'role-mod' },
        {
          type: 'core.bindPermission',
          payload: { permissionId: PERMISSION_ID, roleLocalId: 'role-mod' },
        },
      ],
      ctx,
    );

    // Après apply : le binding existe en DB et le cache a été invalidé par bind().
    expect(await permissions.canInGuild(GUILD, { type: 'user', id: USER }, PERMISSION_ID)).toBe(
      true,
    );
  });

  it('unbind supprime la ligne après rollback de la session', async () => {
    const permissions = createPermissionService({
      client,
      resolveMemberContext: async () => null,
    });

    // Session en status applied pour permettre undoSession.
    await client.db
      .update(sqliteSchema.onboardingSessions)
      .set({ status: 'applied' })
      .where(eq(sqliteSchema.onboardingSessions.id, SESSION))
      .run();
    // On réinitialise en créant une nouvelle session pour applyActions.
    const SESSION2: OnboardingSessionId = '01HZ0BINDINGE2E000000000002' as OnboardingSessionId;
    await client.db
      .insert(sqliteSchema.onboardingSessions)
      .values({
        id: SESSION2,
        guildId: GUILD,
        startedBy: USER,
        status: 'applying',
        presetSource: 'blank',
      })
      .run();

    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    for (const action of CORE_ACTIONS) {
      exec.registerAction(action);
    }

    const ctx = buildCtx(
      (permissionId, roleId) =>
        permissions.bind(GUILD, permissionId as PermissionId, roleId as RoleId),
      (permissionId, roleId) =>
        permissions.unbind(GUILD, permissionId as PermissionId, roleId as RoleId),
    );

    await exec.applyActions(
      SESSION2,
      [
        { type: 'core.createRole', payload: { name: 'Modérateur' }, localId: 'role-mod' },
        {
          type: 'core.bindPermission',
          payload: { permissionId: PERMISSION_ID, roleLocalId: 'role-mod' },
        },
      ],
      ctx,
    );

    // Binding posé.
    const before = await client.db.select().from(sqliteSchema.permissionBindings).all();
    expect(before).toHaveLength(1);

    // Rollback : undoSession défait les actions en ordre inverse.
    const rollback = await exec.undoSession(SESSION2, ctx);
    expect(rollback.ok).toBe(true);
    expect(rollback.undoneCount).toBe(2);

    // Binding supprimé.
    const after = await client.db.select().from(sqliteSchema.permissionBindings).all();
    expect(after).toHaveLength(0);
  });
});
