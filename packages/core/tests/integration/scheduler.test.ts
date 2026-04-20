import type { GuildId, ModuleId } from '@varde/contracts';
import { ValidationError } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../src/logger.js';
import { createSchedulerService } from '../../src/scheduler.js';

const GUILD: GuildId = '111' as GuildId;
const MODERATION: ModuleId = 'moderation' as ModuleId;

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const seed = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  await client.db
    .insert(sqliteSchema.modulesRegistry)
    .values({ id: MODERATION, version: '1.0.0', manifest: {}, schemaVersion: 1 })
    .run();
};

describe('createSchedulerService — in()', () => {
  let client: DbClient<'sqlite'>;
  let fakeNow: Date;
  const advanceTime = (ms: number): void => {
    fakeNow = new Date(fakeNow.getTime() + ms);
  };

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    fakeNow = new Date('2026-04-21T12:00:00.000Z');
  });

  afterEach(async () => {
    await client.close();
  });

  it('persiste une tâche one_shot et ne la joue pas avant l échéance', async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await scheduler.in(1_000, 'moderation:unban:user-77', handler);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(row?.jobKey).toBe('moderation:unban:user-77');
    expect(row?.kind).toBe('one_shot');
    expect(row?.status).toBe('pending');

    const executed = await scheduler.runOnce();
    expect(executed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("exécute la tâche une fois l'échéance atteinte puis passe à completed", async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await scheduler.in(1_000, 'job-1', handler);

    advanceTime(1_500);
    const executed = await scheduler.runOnce();

    expect(executed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(row?.status).toBe('completed');
    expect(row?.attemptCount).toBe(1);
  });

  it("jobKey dupliqué : l'upsert écrase l'échéance existante", async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await scheduler.in(10_000, 'job-1', handler);
    await scheduler.in(500, 'job-1', handler);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    const expected = new Date(fakeNow.getTime() + 500).toISOString();
    expect(row?.runAt).toBe(expected);
  });

  it('refuse une durée négative', async () => {
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await expect(scheduler.in(-1, 'job-x', () => undefined)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('handler qui jette marque la tâche failed avec lastError', async () => {
    const handler = vi.fn(() => {
      throw new Error('boom');
    });
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await scheduler.in(0, 'job-1', handler);

    const executed = await scheduler.runOnce();
    expect(executed).toBe(0);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(row?.status).toBe('failed');
    expect(row?.lastError).toBe('boom');
  });
});

describe('createSchedulerService — cron()', () => {
  let client: DbClient<'sqlite'>;
  let fakeNow: Date;
  const advanceTime = (ms: number): void => {
    fakeNow = new Date(fakeNow.getTime() + ms);
  };

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    fakeNow = new Date('2026-04-21T12:00:00.000Z');
  });

  afterEach(async () => {
    await client.close();
  });

  it('planifie la prochaine occurrence via cron-parser', async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    // "0 * * * *" = toutes les heures pile.
    await scheduler.cron('0 * * * *', 'cron-hourly', handler);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(row?.kind).toBe('recurring');
    expect(row?.runAt).toBe('2026-04-21T13:00:00.000Z');
    expect(row?.payload).toEqual({ cronExpression: '0 * * * *' });
  });

  it("ré-planifie l'occurrence suivante après exécution", async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await scheduler.cron('0 * * * *', 'cron-hourly', handler);

    // Avance au-delà de la première échéance.
    advanceTime(61 * 60 * 1_000);
    const executed = await scheduler.runOnce();
    expect(executed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(row?.status).toBe('pending');
    expect(row?.runAt).toBe('2026-04-21T14:00:00.000Z');
  });

  it('refuse une expression cron invalide', async () => {
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await expect(scheduler.cron('garbage', 'job-bad', () => undefined)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('createSchedulerService — cancel()', () => {
  let client: DbClient<'sqlite'>;
  let fakeNow: Date;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    fakeNow = new Date('2026-04-21T12:00:00.000Z');
  });

  afterEach(async () => {
    await client.close();
  });

  it('annule une tâche pending et retire son handler du registre', async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    await scheduler.in(0, 'job-1', handler);

    const cancelled = await scheduler.cancel('job-1');
    expect(cancelled).toBe(true);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(row?.status).toBe('cancelled');

    // La tâche n'est plus exécutée même si son échéance arrive.
    const executed = await scheduler.runOnce();
    expect(executed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('retourne false si aucune tâche pending ne matche la jobKey', async () => {
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    expect(await scheduler.cancel('inconnue')).toBe(false);
  });
});

describe('createSchedulerService — at() et register()', () => {
  let client: DbClient<'sqlite'>;
  let fakeNow: Date;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    fakeNow = new Date('2026-04-21T12:00:00.000Z');
  });

  afterEach(async () => {
    await client.close();
  });

  it('at() persiste la date fournie', async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });
    const when = new Date('2026-05-01T00:00:00.000Z');
    await scheduler.at(when, 'cleanup-may', handler);

    const [row] = await client.db.select().from(sqliteSchema.scheduledTasks).all();
    expect(row?.runAt).toBe(when.toISOString());
  });

  it("register() ré-attache un handler pour une tâche persistée lors d'un redémarrage", async () => {
    // Simule un redémarrage : on insère directement une ligne pending.
    await client.db
      .insert(sqliteSchema.scheduledTasks)
      .values({
        id: '01HZ0000000000000000000001',
        jobKey: 'legacy-job',
        moduleId: MODERATION,
        kind: 'one_shot',
        runAt: '2026-04-21T11:59:00.000Z',
        status: 'pending',
      })
      .run();

    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      now: () => fakeNow,
    });

    // Sans register, runOnce ne trouve pas le handler et saute la tâche.
    expect(await scheduler.runOnce()).toBe(0);
    expect(handler).not.toHaveBeenCalled();

    // Avec register, la tâche est exécutée au prochain tick.
    scheduler.register('legacy-job', handler);
    expect(await scheduler.runOnce()).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('createSchedulerService — start() / stop()', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('exécute les tâches dues via le tick périodique', async () => {
    const handler = vi.fn();
    const scheduler = createSchedulerService({
      client,
      moduleId: MODERATION,
      logger: silentLogger(),
      tickIntervalMs: 20,
    });
    await scheduler.in(0, 'job-1', handler);
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 60));
    scheduler.stop();

    expect(handler).toHaveBeenCalled();
    const row = await client.db
      .select()
      .from(sqliteSchema.scheduledTasks)
      .where(eq(sqliteSchema.scheduledTasks.jobKey, 'job-1'))
      .get();
    expect(row?.status).toBe('completed');
  });
});
