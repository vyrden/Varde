import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  applyMigrations,
  createDbClient,
  type DbClient,
  pgSchema,
  withTransaction,
} from '../../src/index.js';

const {
  guilds,
  guildConfig,
  modulesRegistry,
  guildModules,
  auditLog,
  scheduledTasks,
  onboardingSessions,
  onboardingActionsLog,
  aiInvocations,
} = pgSchema;

const rootMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const causeMessage = error.cause instanceof Error ? error.cause.message : '';
  return `${error.message} ${causeMessage}`.trim();
};

const tablesInResetOrder = [
  'keystore',
  'ai_invocations',
  'onboarding_actions_log',
  'onboarding_sessions',
  'scheduled_tasks',
  'permission_bindings',
  'permissions_registry',
  'audit_log',
  'guild_modules',
  'modules_registry',
  'guild_config',
  'guilds',
  'instance_config',
  'instance_owners',
] as const;

/**
 * Tests d'intégration Postgres réel. Démarre une Testcontainer Postgres
 * 17 pour la durée du fichier, migre une fois, TRUNCATE entre tests.
 *
 * Nécessite Docker accessible. La CI fournit Docker via les runners
 * GitHub Actions standard.
 */
describe('@varde/db — intégration Postgres (Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let client: DbClient<'pg'>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('varde_test')
      .withUsername('varde')
      .withPassword('varde')
      .start();
    client = createDbClient({ driver: 'pg', url: container.getConnectionUri() });
    await applyMigrations(client);
  }, 180_000);

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (container) {
      await container.stop();
    }
  });

  beforeEach(async () => {
    for (const table of tablesInResetOrder) {
      await client.db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
    }
  });

  it('crée les 15 tables attendues (ADR 0001 + onboarding_actions_log + instance_config jalon 7 PR 7.1 + instance_owners + instance_audit_log jalon 7 PR 7.2)', async () => {
    const rows = await client.db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '__drizzle%' ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'ai_invocations',
      'audit_log',
      'guild_config',
      'guild_modules',
      'guilds',
      'instance_audit_log',
      'instance_config',
      'instance_owners',
      'keystore',
      'modules_registry',
      'onboarding_actions_log',
      'onboarding_sessions',
      'permission_bindings',
      'permissions_registry',
      'scheduled_tasks',
    ]);
  });

  it('instance_config : CHECK rejette un id différent de "singleton" (jalon 7 PR 7.1)', async () => {
    let caught: unknown;
    try {
      await client.db.execute(
        sql`INSERT INTO instance_config (id, setup_step) VALUES ('autre', 1)`,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    // Postgres expose le détail dans `cause.message` quand Drizzle
    // masque la requête en haut. Le message exact mentionne le
    // nom de la contrainte CHECK.
    expect(rootMessage(caught)).toMatch(/instance_config_singleton_check|check constraint/i);
  });

  it('instance_config : accepte une seule ligne avec id "singleton"', async () => {
    await client.db.execute(
      sql`INSERT INTO instance_config (id, setup_step) VALUES ('singleton', 1)`,
    );
    const rows = await client.db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM instance_config`,
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('pose l index partiel idx_onboarding_expires avec WHERE status=applied (ADR 0007)', async () => {
    const rows = await client.db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_onboarding_expires'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/WHERE.*status.*=.*'applied'/);
  });

  it('pose l index partiel unique idx_onboarding_active_per_guild (R3)', async () => {
    const rows = await client.db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_onboarding_active_per_guild'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/UNIQUE INDEX/);
    // PG reformule `IN (...)` en `ANY (ARRAY[...])` au niveau du plan.
    expect(rows[0]?.indexdef).toMatch(/WHERE.*status.*'draft'.*'previewing'.*'applying'/);
  });

  it('cascade guilds → guild_config, guild_modules, audit_log sur DELETE', async () => {
    await client.db.insert(guilds).values({ id: '111', name: 'Alpha' });
    await client.db.insert(guildConfig).values({ guildId: '111' });
    await client.db
      .insert(modulesRegistry)
      .values({ id: 'hello-world', version: '1.0.0', manifest: {}, schemaVersion: 1 });
    await client.db
      .insert(guildModules)
      .values({ guildId: '111', moduleId: 'hello-world', enabled: true });
    await client.db.insert(auditLog).values({
      id: '01HZ0000000000000000000100',
      guildId: '111',
      actorType: 'system',
      action: 'core.audit.created',
      severity: 'info',
    });

    await client.db.delete(guilds).where(sql`id = ${'111'}`);

    const configs = await client.db.select().from(guildConfig);
    const mods = await client.db.select().from(guildModules);
    const audits = await client.db.select().from(auditLog);
    const registry = await client.db.select().from(modulesRegistry);
    expect(configs).toHaveLength(0);
    expect(mods).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(registry).toHaveLength(1);
  });

  it('RESTRICT empêche de supprimer un module encore activé', async () => {
    await client.db.insert(guilds).values({ id: '222', name: 'Beta' });
    await client.db
      .insert(modulesRegistry)
      .values({ id: 'moderation', version: '1.0.0', manifest: {}, schemaVersion: 1 });
    await client.db
      .insert(guildModules)
      .values({ guildId: '222', moduleId: 'moderation', enabled: true });

    const error = await client.db
      .delete(modulesRegistry)
      .where(sql`id = ${'moderation'}`)
      .catch((e: unknown) => e);
    expect(rootMessage(error)).toMatch(/violates foreign key|guild_modules/i);
  });

  it('metadata audit_log prend sa valeur par défaut {} quand omise', async () => {
    await client.db.insert(guilds).values({ id: '333', name: 'Gamma' });
    await client.db.insert(auditLog).values({
      id: '01HZ0000000000000000000200',
      guildId: '333',
      actorType: 'system',
      action: 'core.audit.created',
      severity: 'info',
    });
    const [entry] = await client.db.select().from(auditLog);
    expect(entry?.actorId).toBeNull();
    expect(entry?.metadata).toEqual({});
  });

  it('CHECK rejette une severity hors enum', async () => {
    await client.db.insert(guilds).values({ id: '444', name: 'Delta' });
    const error = await client.db
      .insert(auditLog)
      .values({
        id: '01HZ0000000000000000000300',
        guildId: '444',
        actorType: 'system',
        action: 'core.audit.created',
        // biome-ignore lint/suspicious/noExplicitAny: test délibéré d'un cas invalide
        severity: 'catastrophic' as any,
      })
      .catch((e: unknown) => e);
    expect(rootMessage(error)).toMatch(/audit_severity_check|check constraint/i);
  });

  it('scheduled_tasks impose l unicité de job_key', async () => {
    await client.db
      .insert(modulesRegistry)
      .values({ id: 'sched', version: '1.0.0', manifest: {}, schemaVersion: 1 });
    const base = {
      moduleId: 'sched',
      kind: 'one_shot' as const,
      runAt: new Date(Date.now() + 60_000),
    };
    await client.db
      .insert(scheduledTasks)
      .values({ id: '01HZ0000000000000000000400', jobKey: 'sched:purge:1', ...base });
    const error = await client.db
      .insert(scheduledTasks)
      .values({ id: '01HZ0000000000000000000401', jobKey: 'sched:purge:1', ...base })
      .catch((e: unknown) => e);
    expect(rootMessage(error)).toMatch(/duplicate key|idx_tasks_job_key/i);
  });

  it('withTransaction rollback l insertion sur erreur', async () => {
    await client.db.insert(guilds).values({ id: '555', name: 'Epsilon' });
    await expect(
      withTransaction(client, async (tx) => {
        await tx.insert(guildConfig).values({ guildId: '555', version: 42 });
        throw new Error('rollback expected');
      }),
    ).rejects.toThrow('rollback expected');
    const configs = await client.db.select().from(guildConfig);
    expect(configs).toHaveLength(0);
  });

  // ── Onboarding (ADR 0007) ───────────────────────────────────────────

  it('onboarding : cascade DELETE session → actions_log', async () => {
    await client.db.insert(guilds).values({ id: '666', name: 'Zeta' });
    await client.db.insert(onboardingSessions).values({
      id: '01HZ0000000000000000000ONB',
      guildId: '666',
      startedBy: 'user-42',
      status: 'draft',
      presetSource: 'blank',
    });
    await client.db.insert(onboardingActionsLog).values({
      id: '01HZ0000000000000000000ACT',
      sessionId: '01HZ0000000000000000000ONB',
      sequence: 0,
      actionType: 'createRole',
      actionPayload: { name: 'Modérateur' },
      status: 'pending',
    });
    await client.db.delete(onboardingSessions);
    const rows = await client.db.select().from(onboardingActionsLog);
    expect(rows).toHaveLength(0);
  });

  it('onboarding : refuse une 2e session active pour la même guild (R3)', async () => {
    await client.db.insert(guilds).values({ id: '777', name: 'Eta' });
    await client.db.insert(onboardingSessions).values({
      id: '01HZ0000000000000000000S01',
      guildId: '777',
      startedBy: 'user-42',
      status: 'draft',
      presetSource: 'blank',
    });
    const error = await client.db
      .insert(onboardingSessions)
      .values({
        id: '01HZ0000000000000000000S02',
        guildId: '777',
        startedBy: 'user-42',
        status: 'previewing',
        presetSource: 'preset',
      })
      .catch((e: unknown) => e);
    expect(rootMessage(error)).toMatch(/duplicate key|idx_onboarding_active_per_guild/i);
  });

  it('onboarding : autorise une nouvelle session après rollback de la précédente', async () => {
    await client.db.insert(guilds).values({ id: '888', name: 'Theta' });
    await client.db.insert(onboardingSessions).values({
      id: '01HZ0000000000000000000S11',
      guildId: '888',
      startedBy: 'user-42',
      status: 'draft',
      presetSource: 'blank',
    });
    await client.db
      .update(onboardingSessions)
      .set({ status: 'rolled_back' })
      .where(sql`${onboardingSessions.id} = '01HZ0000000000000000000S11'`);
    await expect(
      client.db.insert(onboardingSessions).values({
        id: '01HZ0000000000000000000S12',
        guildId: '888',
        startedBy: 'user-42',
        status: 'draft',
        presetSource: 'blank',
      }),
    ).resolves.toBeDefined();
  });

  it('onboarding : CHECK rejette un status hors enum', async () => {
    await client.db.insert(guilds).values({ id: '999', name: 'Iota' });
    const error = await client.db
      .insert(onboardingSessions)
      .values({
        id: '01HZ0000000000000000000S21',
        guildId: '999',
        startedBy: 'user-42',
        // biome-ignore lint/suspicious/noExplicitAny: test d intention, status invalide
        status: 'unknown' as any,
        presetSource: 'blank',
      })
      .catch((e: unknown) => e);
    expect(rootMessage(error)).toMatch(/onboarding_status_check/i);
  });

  it('onboarding_actions_log : unicité de (session_id, sequence)', async () => {
    await client.db.insert(guilds).values({ id: 'AAA', name: 'Kappa' });
    await client.db.insert(onboardingSessions).values({
      id: '01HZ0000000000000000000S31',
      guildId: 'AAA',
      startedBy: 'user-42',
      status: 'applying',
      presetSource: 'blank',
    });
    await client.db.insert(onboardingActionsLog).values({
      id: '01HZ0000000000000000000A1A',
      sessionId: '01HZ0000000000000000000S31',
      sequence: 0,
      actionType: 'createRole',
      actionPayload: {},
      status: 'applied',
    });
    const error = await client.db
      .insert(onboardingActionsLog)
      .values({
        id: '01HZ0000000000000000000A1B',
        sessionId: '01HZ0000000000000000000S31',
        sequence: 0,
        actionType: 'createChannel',
        actionPayload: {},
        status: 'pending',
      })
      .catch((e: unknown) => e);
    expect(rootMessage(error)).toMatch(/duplicate key|idx_onboarding_actions_session_sequence/i);
  });

  it('ai_invocations : colonnes actor_id et prompt_version présentes (R4/R5)', async () => {
    await client.db.insert(guilds).values({ id: 'BBB', name: 'Lambda' });
    await client.db.insert(aiInvocations).values({
      id: '01HZ0000000000000000000AI1',
      guildId: 'BBB',
      actorId: 'user-42',
      purpose: 'generatePreset',
      provider: 'stub',
      model: 'rule-based',
      promptHash: 'hash',
      promptVersion: 'v1',
      success: true,
    });
    const rows = await client.db.select().from(aiInvocations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe('user-42');
    expect(rows[0]?.promptVersion).toBe('v1');
  });
});
