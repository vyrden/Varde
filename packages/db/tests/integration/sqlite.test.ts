import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyMigrations,
  createDbClient,
  type DbClient,
  sqliteSchema,
  withTransaction,
} from '../../src/index.js';

const { guilds, guildConfig, modulesRegistry, guildModules, auditLog, scheduledTasks } =
  sqliteSchema;

const nowIso = (offsetMs = 0): string => new Date(Date.now() + offsetMs).toISOString();

describe('@varde/db — intégration SQLite (in-memory)', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('crée les 11 tables attendues par l ADR 0001', async () => {
    const rows = await client.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`,
    );
    expect(rows.map((r) => r.name)).toEqual([
      'ai_invocations',
      'audit_log',
      'guild_config',
      'guild_modules',
      'guilds',
      'keystore',
      'modules_registry',
      'onboarding_sessions',
      'permission_bindings',
      'permissions_registry',
      'scheduled_tasks',
    ]);
  });

  it('applique foreign_keys=ON et rejette une FK invalide', async () => {
    await expect(async () =>
      client.db.insert(guildConfig).values({ guildId: '999' }).run(),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('cascade guilds → guild_config et guild_modules sur DELETE', async () => {
    await client.db.insert(guilds).values({ id: '111', name: 'Alpha' }).run();
    await client.db.insert(guildConfig).values({ guildId: '111' }).run();
    await client.db
      .insert(modulesRegistry)
      .values({ id: 'hello-world', version: '1.0.0', manifest: {}, schemaVersion: 1 })
      .run();
    await client.db
      .insert(guildModules)
      .values({ guildId: '111', moduleId: 'hello-world', enabled: true })
      .run();

    await client.db.delete(guilds).where(sql`id = ${'111'}`).run();

    const configs = await client.db.select().from(guildConfig).all();
    const mods = await client.db.select().from(guildModules).all();
    const registry = await client.db.select().from(modulesRegistry).all();
    expect(configs).toHaveLength(0);
    expect(mods).toHaveLength(0);
    expect(registry).toHaveLength(1);
  });

  it('RESTRICT empêche de supprimer un module encore activé', async () => {
    await client.db.insert(guilds).values({ id: '222', name: 'Beta' }).run();
    await client.db
      .insert(modulesRegistry)
      .values({ id: 'moderation', version: '1.0.0', manifest: {}, schemaVersion: 1 })
      .run();
    await client.db
      .insert(guildModules)
      .values({ guildId: '222', moduleId: 'moderation', enabled: true })
      .run();

    await expect(async () =>
      client.db.delete(modulesRegistry).where(sql`id = ${'moderation'}`).run(),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('audit_log accepte un acteur system sans actor_id, metadata par défaut', async () => {
    await client.db.insert(guilds).values({ id: '333', name: 'Gamma' }).run();
    await client.db
      .insert(auditLog)
      .values({
        id: '01HZ0000000000000000000001',
        guildId: '333',
        actorType: 'system',
        action: 'core.audit.created',
        severity: 'info',
      })
      .run();
    const [entry] = await client.db.select().from(auditLog).all();
    expect(entry).toBeDefined();
    expect(entry?.actorId).toBeNull();
    expect(entry?.metadata).toEqual({});
  });

  it('CHECK rejette une severity hors enum', async () => {
    await client.db.insert(guilds).values({ id: '444', name: 'Delta' }).run();
    await expect(async () =>
      client.db
        .insert(auditLog)
        .values({
          id: '01HZ0000000000000000000002',
          guildId: '444',
          actorType: 'system',
          action: 'core.audit.created',
          // biome-ignore lint/suspicious/noExplicitAny: test délibéré d'un cas invalide
          severity: 'catastrophic' as any,
        })
        .run(),
    ).rejects.toThrow(/CHECK/i);
  });

  it('scheduled_tasks impose l unicité de job_key', async () => {
    await client.db
      .insert(modulesRegistry)
      .values({ id: 'sched', version: '1.0.0', manifest: {}, schemaVersion: 1 })
      .run();
    const base = {
      moduleId: 'sched',
      kind: 'one_shot' as const,
      runAt: nowIso(60_000),
    };
    await client.db
      .insert(scheduledTasks)
      .values({ id: '01HZ0000000000000000000010', jobKey: 'sched:purge:1', ...base })
      .run();
    await expect(async () =>
      client.db
        .insert(scheduledTasks)
        .values({ id: '01HZ0000000000000000000011', jobKey: 'sched:purge:1', ...base })
        .run(),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('withTransaction rollback l insertion sur erreur', async () => {
    await client.db.insert(guilds).values({ id: '555', name: 'Epsilon' }).run();
    await expect(
      withTransaction(client, async (tx) => {
        await tx.insert(guildConfig).values({ guildId: '555', version: 42 }).run();
        throw new Error('rollback expected');
      }),
    ).rejects.toThrow('rollback expected');

    const configs = await client.db.select().from(guildConfig).all();
    expect(configs).toHaveLength(0);
  });
});
