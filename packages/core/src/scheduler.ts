import {
  type GuildId,
  type Logger,
  type ModuleId,
  newUlid,
  type ScheduledTaskHandler,
  type SchedulerService,
  type Ulid,
  ValidationError,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { CronExpressionParser } from 'cron-parser';
import { and, eq, lte, sql } from 'drizzle-orm';

/**
 * SchedulerService — backend DB-polling (mode dégradé ADR 0003).
 *
 * Objectif : permettre aux modules de planifier des tâches one-shot
 * (`in`, `at`) ou récurrentes (`cron`) sans dépendre de Redis/BullMQ.
 * Les tâches sont persistées dans `scheduled_tasks` ; une boucle
 * `runOnce()` réclame les tâches dues, exécute leur handler en
 * mémoire, puis met à jour la ligne (completed / failed / re-scheduled
 * pour cron).
 *
 * Contrat d'exécution V1 :
 * - Single-process assumé. Le claim se fait par `UPDATE ... WHERE
 *   status = 'pending'` qui, sur SQLite in-process ou Postgres
 *   transactionnel, suffit à éviter les double-exécutions dans le
 *   même process. Un adapter BullMQ distribué viendra post-V1 pour
 *   le multi-process.
 * - Les handlers vivent en mémoire du process (`registry: Map<jobKey,
 *   handler>`) et doivent être ré-attachés à chaque démarrage. Les
 *   modules font ça dans leur `onLoad` (PR 1.5) en rappelant
 *   `in/at/cron` avec la même jobKey : l'upsert laisse la ligne en
 *   place si elle est déjà `pending`, la ré-attache du handler remet
 *   la tâche en état exécutable.
 * - `cron` stocke l'expression dans `payload.cronExpression` ; à la
 *   complétion, on calcule la prochaine occurrence via
 *   `cron-parser` et on repasse à `pending`.
 * - `cancel(jobKey)` marque la ligne `cancelled` et retire le handler
 *   du registre. Idempotent, retourne `true` si une ligne était
 *   pending, `false` sinon.
 */

/** Kind de planification persisté (aligné `scheduled_tasks.kind`). */
type TaskKind = 'one_shot' | 'recurring';

/** Status persisté (aligné `scheduled_tasks.status`). */
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Options de construction. */
export interface CreateSchedulerServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly moduleId: ModuleId;
  readonly logger: Logger;
  /** Intervalle du tick automatique en ms. Défaut : 10 000. */
  readonly tickIntervalMs?: number;
  /** Horloge injectable (tests). Défaut : `() => new Date()`. */
  readonly now?: () => Date;
  /** GuildId par défaut porté par les lignes planifiées. */
  readonly defaultGuildId?: GuildId | null;
}

/**
 * Variante étendue exposée au core : ajoute `start`/`stop` pour la
 * boucle et `runOnce` pour les tests, ainsi que `register` pour
 * ré-attacher un handler sans reprogrammer la tâche.
 */
export interface CoreSchedulerService extends SchedulerService {
  readonly start: () => void;
  readonly stop: () => void;
  readonly runOnce: () => Promise<number>;
  readonly register: (jobKey: string, handler: ScheduledTaskHandler) => void;
}

interface PersistedTask {
  readonly id: Ulid;
  readonly jobKey: string;
  readonly kind: TaskKind;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly runAt: Date;
  readonly status: TaskStatus;
}

const DEFAULT_TICK_MS = 10_000;
const PAYLOAD_CRON_KEY = 'cronExpression';

const getCronExpression = (payload: Readonly<Record<string, unknown>>): string | null => {
  const value = payload[PAYLOAD_CRON_KEY];
  return typeof value === 'string' ? value : null;
};

const computeNextCronDate = (expression: string, from: Date): Date => {
  try {
    const interval = CronExpressionParser.parse(expression, { currentDate: from });
    return interval.next().toDate();
  } catch (error) {
    throw new ValidationError('SchedulerService.cron : expression cron invalide', {
      metadata: { expression, cause: (error as Error).message },
    });
  }
};

const selectDueTasks = async <D extends DbDriver>(
  client: DbClient<D>,
  moduleId: ModuleId,
  now: Date,
): Promise<readonly PersistedTask[]> => {
  if (client.driver === 'pg') {
    const { scheduledTasks } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({
        id: scheduledTasks.id,
        jobKey: scheduledTasks.jobKey,
        kind: scheduledTasks.kind,
        payload: scheduledTasks.payload,
        runAt: scheduledTasks.runAt,
        status: scheduledTasks.status,
      })
      .from(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.moduleId, moduleId),
          eq(scheduledTasks.status, 'pending'),
          lte(scheduledTasks.runAt, now),
        ),
      );
    return rows.map((r) => ({
      id: r.id as Ulid,
      jobKey: r.jobKey,
      kind: r.kind,
      payload: (r.payload ?? {}) as Readonly<Record<string, unknown>>,
      runAt: r.runAt,
      status: r.status,
    }));
  }
  const { scheduledTasks } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const nowIso = toCanonicalDate(now);
  const rows = sqlite.db
    .select({
      id: scheduledTasks.id,
      jobKey: scheduledTasks.jobKey,
      kind: scheduledTasks.kind,
      payload: scheduledTasks.payload,
      runAt: scheduledTasks.runAt,
      status: scheduledTasks.status,
    })
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.moduleId, moduleId),
        eq(scheduledTasks.status, 'pending'),
        lte(scheduledTasks.runAt, nowIso),
      ),
    )
    .all();
  return rows.map((r) => ({
    id: r.id as Ulid,
    jobKey: r.jobKey,
    kind: r.kind,
    payload: (r.payload ?? {}) as Readonly<Record<string, unknown>>,
    runAt: new Date(r.runAt),
    status: r.status,
  }));
};

const claimTask = async <D extends DbDriver>(
  client: DbClient<D>,
  taskId: Ulid,
  now: Date,
): Promise<boolean> => {
  if (client.driver === 'pg') {
    const { scheduledTasks } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const result = await pg.db
      .update(scheduledTasks)
      .set({
        status: 'running',
        attemptCount: sql`${scheduledTasks.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.status, 'pending')))
      .returning({ id: scheduledTasks.id });
    return result.length > 0;
  }
  const { scheduledTasks } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const nowIso = toCanonicalDate(now);
  const result = sqlite.db
    .update(scheduledTasks)
    .set({
      status: 'running',
      attemptCount: sql`${scheduledTasks.attemptCount} + 1`,
      updatedAt: nowIso,
    })
    .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.status, 'pending')))
    .run();
  return Number(result.changes ?? 0) > 0;
};

const finalizeOneShot = async <D extends DbDriver>(
  client: DbClient<D>,
  taskId: Ulid,
  now: Date,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { scheduledTasks } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .update(scheduledTasks)
      .set({ status: 'completed', lastError: null, updatedAt: now })
      .where(eq(scheduledTasks.id, taskId));
    return;
  }
  const { scheduledTasks } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const nowIso = toCanonicalDate(now);
  sqlite.db
    .update(scheduledTasks)
    .set({ status: 'completed', lastError: null, updatedAt: nowIso })
    .where(eq(scheduledTasks.id, taskId))
    .run();
};

const rescheduleRecurring = async <D extends DbDriver>(
  client: DbClient<D>,
  taskId: Ulid,
  nextRunAt: Date,
  now: Date,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { scheduledTasks } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .update(scheduledTasks)
      .set({ status: 'pending', runAt: nextRunAt, lastError: null, updatedAt: now })
      .where(eq(scheduledTasks.id, taskId));
    return;
  }
  const { scheduledTasks } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const nowIso = toCanonicalDate(now);
  const nextIso = toCanonicalDate(nextRunAt);
  sqlite.db
    .update(scheduledTasks)
    .set({ status: 'pending', runAt: nextIso, lastError: null, updatedAt: nowIso })
    .where(eq(scheduledTasks.id, taskId))
    .run();
};

const markFailed = async <D extends DbDriver>(
  client: DbClient<D>,
  taskId: Ulid,
  errorMessage: string,
  now: Date,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { scheduledTasks } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .update(scheduledTasks)
      .set({ status: 'failed', lastError: errorMessage, updatedAt: now })
      .where(eq(scheduledTasks.id, taskId));
    return;
  }
  const { scheduledTasks } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const nowIso = toCanonicalDate(now);
  sqlite.db
    .update(scheduledTasks)
    .set({ status: 'failed', lastError: errorMessage, updatedAt: nowIso })
    .where(eq(scheduledTasks.id, taskId))
    .run();
};

const cancelTask = async <D extends DbDriver>(
  client: DbClient<D>,
  moduleId: ModuleId,
  jobKey: string,
  now: Date,
): Promise<boolean> => {
  if (client.driver === 'pg') {
    const { scheduledTasks } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const result = await pg.db
      .update(scheduledTasks)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(scheduledTasks.moduleId, moduleId),
          eq(scheduledTasks.jobKey, jobKey),
          eq(scheduledTasks.status, 'pending'),
        ),
      )
      .returning({ id: scheduledTasks.id });
    return result.length > 0;
  }
  const { scheduledTasks } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const nowIso = toCanonicalDate(now);
  const result = sqlite.db
    .update(scheduledTasks)
    .set({ status: 'cancelled', updatedAt: nowIso })
    .where(
      and(
        eq(scheduledTasks.moduleId, moduleId),
        eq(scheduledTasks.jobKey, jobKey),
        eq(scheduledTasks.status, 'pending'),
      ),
    )
    .run();
  return Number(result.changes ?? 0) > 0;
};

interface UpsertRow {
  readonly moduleId: ModuleId;
  readonly guildId: GuildId | null;
  readonly jobKey: string;
  readonly kind: TaskKind;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly runAt: Date;
}

const upsertPending = async <D extends DbDriver>(
  client: DbClient<D>,
  row: UpsertRow,
  now: Date,
): Promise<void> => {
  const id = newUlid();
  if (client.driver === 'pg') {
    const { scheduledTasks } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .insert(scheduledTasks)
      .values({
        id,
        jobKey: row.jobKey,
        moduleId: row.moduleId,
        guildId: row.guildId,
        kind: row.kind,
        payload: row.payload,
        runAt: row.runAt,
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: scheduledTasks.jobKey,
        set: {
          kind: row.kind,
          payload: row.payload,
          runAt: row.runAt,
          status: 'pending',
          attemptCount: 0,
          lastError: null,
          updatedAt: now,
        },
      });
    return;
  }
  const { scheduledTasks } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const nowIso = toCanonicalDate(now);
  const runAtIso = toCanonicalDate(row.runAt);
  await sqlite.db
    .insert(scheduledTasks)
    .values({
      id,
      jobKey: row.jobKey,
      moduleId: row.moduleId,
      guildId: row.guildId,
      kind: row.kind,
      payload: row.payload,
      runAt: runAtIso,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: scheduledTasks.jobKey,
      set: {
        kind: row.kind,
        payload: row.payload,
        runAt: runAtIso,
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        updatedAt: nowIso,
      },
    });
};

export function createSchedulerService<D extends DbDriver>(
  options: CreateSchedulerServiceOptions<D>,
): CoreSchedulerService {
  const { client, moduleId } = options;
  const tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_MS;
  const now = options.now ?? (() => new Date());
  const defaultGuildId = options.defaultGuildId ?? null;
  const logger = options.logger.child({ component: 'scheduler', moduleId });

  const registry = new Map<string, ScheduledTaskHandler>();
  let interval: ReturnType<typeof setInterval> | null = null;

  const runOnce = async (): Promise<number> => {
    const tickAt = now();
    const due = await selectDueTasks(client, moduleId, tickAt);
    let executed = 0;
    for (const task of due) {
      const handler = registry.get(task.jobKey);
      if (!handler) {
        continue;
      }
      const claimed = await claimTask(client, task.id, tickAt);
      if (!claimed) {
        continue;
      }
      try {
        await handler();
        if (task.kind === 'recurring') {
          const expression = getCronExpression(task.payload);
          if (!expression) {
            await markFailed(client, task.id, 'cron expression manquante dans payload', tickAt);
          } else {
            const next = computeNextCronDate(expression, tickAt);
            await rescheduleRecurring(client, task.id, next, tickAt);
          }
        } else {
          await finalizeOneShot(client, task.id, tickAt);
        }
        executed += 1;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn('scheduled task failed', { jobKey: task.jobKey, error: err.message });
        await markFailed(client, task.id, err.message, tickAt);
      }
    }
    return executed;
  };

  return {
    async in(durationMs, jobKey, handler) {
      if (durationMs < 0) {
        throw new ValidationError('SchedulerService.in : durationMs doit être ≥ 0', {
          metadata: { jobKey, durationMs },
        });
      }
      const tickAt = now();
      const runAt = new Date(tickAt.getTime() + durationMs);
      registry.set(jobKey, handler);
      await upsertPending(
        client,
        { moduleId, guildId: defaultGuildId, jobKey, kind: 'one_shot', payload: {}, runAt },
        tickAt,
      );
    },

    async at(date, jobKey, handler) {
      if (Number.isNaN(date.getTime())) {
        throw new ValidationError('SchedulerService.at : date invalide', { metadata: { jobKey } });
      }
      const tickAt = now();
      registry.set(jobKey, handler);
      await upsertPending(
        client,
        { moduleId, guildId: defaultGuildId, jobKey, kind: 'one_shot', payload: {}, runAt: date },
        tickAt,
      );
    },

    async cron(expression, jobKey, handler) {
      const tickAt = now();
      const runAt = computeNextCronDate(expression, tickAt);
      registry.set(jobKey, handler);
      await upsertPending(
        client,
        {
          moduleId,
          guildId: defaultGuildId,
          jobKey,
          kind: 'recurring',
          payload: { [PAYLOAD_CRON_KEY]: expression },
          runAt,
        },
        tickAt,
      );
    },

    async cancel(jobKey) {
      const tickAt = now();
      const cancelled = await cancelTask(client, moduleId, jobKey, tickAt);
      if (cancelled) {
        registry.delete(jobKey);
      }
      return cancelled;
    },

    start() {
      if (interval) return;
      interval = setInterval(() => {
        void runOnce().catch((error: unknown) => {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('scheduler tick loop failed', err);
        });
      }, tickIntervalMs);
    },

    stop() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    },

    runOnce,

    register(jobKey, handler) {
      registry.set(jobKey, handler);
    },
  };
}
