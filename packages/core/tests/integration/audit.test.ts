import type { ActionId, GuildId, ModuleId, UserId } from '@varde/contracts';
import { ValidationError } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAuditService } from '../../src/audit.js';

const GUILD: GuildId = '111' as GuildId;
const OTHER_GUILD: GuildId = '222' as GuildId;
const USER: UserId = '42' as UserId;
const MODERATION: ModuleId = 'moderation' as ModuleId;

const seed = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db
    .insert(sqliteSchema.guilds)
    .values([
      { id: GUILD, name: 'Alpha' },
      { id: OTHER_GUILD, name: 'Beta' },
    ])
    .run();
  await client.db
    .insert(sqliteSchema.modulesRegistry)
    .values({ id: MODERATION, version: '1.0.0', manifest: {}, schemaVersion: 1 })
    .run();
};

describe('createAuditService — log', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('enregistre une entrée avec ULID généré et moduleId de scope', async () => {
    const audit = createAuditService({ client, scope: { kind: 'module', moduleId: MODERATION } });
    await audit.log({
      guildId: GUILD,
      action: 'moderation.ban.issued' as ActionId,
      actor: { type: 'user', id: USER },
      target: { type: 'user', id: '77' },
      severity: 'warn',
      metadata: { reason: 'spam' },
    });
    const [row] = await client.db.select().from(sqliteSchema.auditLog).all();
    expect(row).toMatchObject({
      guildId: GUILD,
      actorType: 'user',
      actorId: USER,
      action: 'moderation.ban.issued',
      targetType: 'user',
      targetId: '77',
      moduleId: MODERATION,
      severity: 'warn',
      metadata: { reason: 'spam' },
    });
    expect(row?.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('actor system persiste avec actorId null', async () => {
    const audit = createAuditService({ client });
    await audit.log({
      guildId: GUILD,
      action: 'core.scheduler.tick' as ActionId,
      actor: { type: 'system' },
      severity: 'info',
    });
    const [row] = await client.db.select().from(sqliteSchema.auditLog).all();
    expect(row?.actorType).toBe('system');
    expect(row?.actorId).toBeNull();
  });

  it('lève ValidationError si guildId absent', async () => {
    const audit = createAuditService({ client });
    await expect(
      audit.log({
        action: 'x.y.z' as ActionId,
        actor: { type: 'system' },
        severity: 'info',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('metadata absent se persiste en {} par défaut', async () => {
    const audit = createAuditService({ client });
    await audit.log({
      guildId: GUILD,
      action: 'x.y.z' as ActionId,
      actor: { type: 'system' },
      severity: 'info',
    });
    const [row] = await client.db.select().from(sqliteSchema.auditLog).all();
    expect(row?.metadata).toEqual({});
  });

  it('scope core laisse moduleId null si acteur non-module', async () => {
    const audit = createAuditService({ client });
    await audit.log({
      guildId: GUILD,
      action: 'core.guild.joined' as ActionId,
      actor: { type: 'user', id: USER },
      severity: 'info',
    });
    const [row] = await client.db.select().from(sqliteSchema.auditLog).all();
    expect(row?.moduleId).toBeNull();
  });

  it('acteur module sans scope explicite pose moduleId depuis actor.id', async () => {
    const audit = createAuditService({ client });
    await audit.log({
      guildId: GUILD,
      action: 'moderation.ban.issued' as ActionId,
      actor: { type: 'module', id: MODERATION },
      severity: 'warn',
    });
    const [row] = await client.db.select().from(sqliteSchema.auditLog).all();
    expect(row?.moduleId).toBe(MODERATION);
  });
});

describe('createAuditService — query', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    const audit = createAuditService({ client });
    await audit.log({
      guildId: GUILD,
      action: 'moderation.ban.issued' as ActionId,
      actor: { type: 'user', id: USER },
      severity: 'warn',
    });
    await audit.log({
      guildId: GUILD,
      action: 'core.scheduler.tick' as ActionId,
      actor: { type: 'system' },
      severity: 'info',
    });
    await audit.log({
      guildId: OTHER_GUILD,
      action: 'moderation.ban.issued' as ActionId,
      actor: { type: 'system' },
      severity: 'warn',
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('filtre par guildId', async () => {
    const audit = createAuditService({ client });
    const rows = await audit.query({ guildId: GUILD });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.guildId === GUILD)).toBe(true);
  });

  it('filtre par severity', async () => {
    const audit = createAuditService({ client });
    const rows = await audit.query({ severity: 'warn' });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.severity === 'warn')).toBe(true);
  });

  it('ordonne par createdAt desc et respecte limit', async () => {
    const audit = createAuditService({ client });
    const rows = await audit.query({ limit: 2 });
    expect(rows).toHaveLength(2);
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (previous && current) {
        expect(previous.createdAt >= current.createdAt).toBe(true);
      }
    }
  });
});

describe('createAuditService — purge', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('supprime les entrées antérieures à olderThan et ne touche pas les autres', async () => {
    await client.db
      .insert(sqliteSchema.auditLog)
      .values([
        {
          id: '01HZ0000000000000000000001',
          guildId: GUILD,
          actorType: 'system',
          action: 'x.y.z',
          severity: 'info',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
        {
          id: '01HZ0000000000000000000002',
          guildId: GUILD,
          actorType: 'system',
          action: 'x.y.z',
          severity: 'info',
          createdAt: '2030-01-01T00:00:00.000Z',
        },
        {
          id: '01HZ0000000000000000000003',
          guildId: OTHER_GUILD,
          actorType: 'system',
          action: 'x.y.z',
          severity: 'info',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ])
      .run();

    const audit = createAuditService({ client });
    const deleted = await audit.purge({
      guildId: GUILD,
      olderThan: new Date('2025-01-01T00:00:00.000Z'),
    });
    expect(deleted).toBe(1);

    const remaining = await client.db.select().from(sqliteSchema.auditLog).all();
    expect(remaining).toHaveLength(2);
    expect(remaining.find((r) => r.guildId === GUILD)?.createdAt).toBe('2030-01-01T00:00:00.000Z');
    expect(remaining.find((r) => r.guildId === OTHER_GUILD)?.createdAt).toBe(
      '2020-01-01T00:00:00.000Z',
    );
  });
});
