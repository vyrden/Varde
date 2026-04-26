import type {
  ChannelId,
  CommandInteractionInput,
  GuildId,
  ModuleId,
  PermissionId,
  RoleId,
  UserId,
} from '@varde/contracts';
import { sqliteSchema } from '@varde/db';
import { createTestHarness, type TestHarness } from '@varde/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { helloWorld } from '../../src/index.js';
import { locales } from '../../src/locales.js';

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const CHANNEL: ChannelId = '222' as ChannelId;
const MODERATOR_ROLE: RoleId = 'role-mod' as RoleId;
const HELLO: ModuleId = 'hello-world' as ModuleId;
const PING_PERMISSION: PermissionId = 'hello-world.ping' as PermissionId;

const START = new Date('2026-05-01T12:00:00.000Z');

const memberJoinInput = {
  kind: 'guildMemberAdd' as const,
  guildId: GUILD,
  userId: USER,
  joinedAt: START.getTime(),
};

const pingInteraction: CommandInteractionInput = {
  commandName: 'ping',
  guildId: GUILD,
  channelId: CHANNEL,
  userId: USER,
  options: {},
};

describe('hello-world — e2e avec TestHarness', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createTestHarness({
      guilds: [{ id: GUILD, name: 'Alpha' }],
      startTime: START,
      defaultLocale: 'fr',
      locales: { 'hello-world': locales },
    });
    await harness.loadModule(helloWorld);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('guild.memberJoin déclenche l audit hello-world.welcome.greeted', async () => {
    await harness.emitDiscord(memberJoinInput);

    const rows = await harness.client.db.select().from(sqliteSchema.auditLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      guildId: GUILD,
      action: 'hello-world.welcome.greeted',
      actorType: 'module',
      actorId: HELLO,
      targetType: 'user',
      targetId: USER,
      severity: 'info',
    });
    expect(rows[0]?.metadata).toMatchObject({
      greeting: expect.stringContaining(USER),
    });
  });

  it("planifie une tâche welcome et l'exécute après advanceTime + runScheduled", async () => {
    await harness.emitDiscord(memberJoinInput);

    // Avant d'avancer l'horloge, aucune tâche n'est due.
    expect(await harness.runScheduled(HELLO)).toBe(0);

    harness.advanceTime(400);
    const executed = await harness.runScheduled(HELLO);
    expect(executed).toBe(1);

    const rows = await harness.client.db.select().from(sqliteSchema.auditLog).all();
    const sent = rows.find((r) => r.action === 'hello-world.welcome.sent');
    expect(sent).toMatchObject({
      guildId: GUILD,
      action: 'hello-world.welcome.sent',
      actorType: 'module',
      actorId: HELLO,
      targetType: 'user',
      targetId: USER,
    });

    const scheduled = await harness.client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(scheduled[0]?.status).toBe('completed');
  });

  it('/ping refusé pour un user sans binding sur hello-world.ping', async () => {
    harness.setMemberContext(GUILD, USER, {
      roles: [],
      isOwner: false,
      isAdministrator: false,
    });
    const reply = await harness.runCommand(pingInteraction);
    expect(reply.kind).toBe('error');
  });

  it('/ping autorisé via Administrator bypass, réponse localisée fr', async () => {
    harness.setMemberContext(GUILD, USER, {
      roles: [],
      isOwner: false,
      isAdministrator: true,
    });
    const reply = await harness.runCommand(pingInteraction);
    expect(reply).toEqual({
      kind: 'success',
      payload: { message: 'pong' },
    });
  });

  it('/ping autorisé via binding rôle, réponse localisée', async () => {
    await harness.client.db
      .insert(sqliteSchema.permissionsRegistry)
      .values({
        id: PING_PERMISSION,
        moduleId: HELLO,
        description: 'ping',
        category: 'utility',
        defaultLevel: 'member',
      })
      .run();
    await harness.client.db
      .insert(sqliteSchema.permissionBindings)
      .values({ guildId: GUILD, permissionId: PING_PERMISSION, roleId: MODERATOR_ROLE })
      .run();
    harness.setMemberContext(GUILD, USER, {
      roles: [MODERATOR_ROLE],
      isOwner: false,
      isAdministrator: false,
    });

    const reply = await harness.runCommand(pingInteraction);
    expect(reply).toMatchObject({ kind: 'success', payload: { message: 'pong' } });
  });

  it("rollback propre : unloadAll() laisse la DB cohérente et les handlers n'émettent plus", async () => {
    // Vérifie que handler est actif.
    await harness.emitDiscord(memberJoinInput);
    const before = await harness.client.db.select().from(sqliteSchema.auditLog).all();
    expect(before).toHaveLength(1);

    await harness.loader.unloadAll();

    // Après unload, un nouveau guildMemberAdd ne produit plus d'audit.
    await harness.emitDiscord({ ...memberJoinInput, userId: '99' as UserId });
    const after = await harness.client.db.select().from(sqliteSchema.auditLog).all();
    expect(after).toHaveLength(1);
  });

  it('emitCore : un événement poussé directement sur l EventBus atteint le handler du module', async () => {
    await harness.emitCore({
      type: 'guild.memberJoin',
      guildId: GUILD,
      userId: '55' as UserId,
      joinedAt: START.getTime(),
    });
    const rows = await harness.client.db.select().from(sqliteSchema.auditLog).all();
    expect(rows[0]?.targetId).toBe('55');
  });

  it('consomme la config welcomeDelayMs et l audite en metadata', async () => {
    await harness.config.ensureGuild(GUILD);
    await harness.config.setWith(
      GUILD,
      { modules: { 'hello-world': { welcomeDelayMs: 1_000 } } },
      { scope: 'modules.hello-world' },
    );

    await harness.emitDiscord(memberJoinInput);

    const [greeted] = await harness.client.db.select().from(sqliteSchema.auditLog).all();
    expect((greeted?.metadata as { delayMs?: number }).delayMs).toBe(1_000);

    // À 400 ms, la tâche n'est pas encore due (delay = 1000).
    harness.advanceTime(400);
    expect(await harness.runScheduled(HELLO)).toBe(0);

    // À 1_100 ms cumulés, la tâche s'exécute.
    harness.advanceTime(700);
    expect(await harness.runScheduled(HELLO)).toBe(1);

    const rows = await harness.client.db.select().from(sqliteSchema.auditLog).all();
    const sent = rows.find((r) => r.action === 'hello-world.welcome.sent');
    expect(sent).toBeDefined();
  });
});
