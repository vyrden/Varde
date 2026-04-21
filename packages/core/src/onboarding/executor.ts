import {
  type Logger,
  newUlid,
  type OnboardingActionContext,
  type OnboardingActionDefinition,
  type OnboardingActionRequest,
  type OnboardingActionStatus,
  type OnboardingSessionId,
  type Ulid,
  ValidationError,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { asc, desc, eq } from 'drizzle-orm';

/**
 * OnboardingExecutor : orchestre l'application et le rollback d'une
 * séquence d'actions dans une session d'onboarding (ADR 0007).
 *
 * Cycle de vie d'une session côté executor :
 *
 * 1. `applyActions(sessionId, requests, ctx)` — insère les actions en
 *    base avec status `pending` (batch), puis itère séquentiellement
 *    avec un délai de 50 ms entre chaque. Une action réussie passe à
 *    `applied` avec son `externalId` et son `result`. Une action qui
 *    échoue passe à `failed`, un undo automatique est lancé en ordre
 *    inverse sur toutes les actions déjà `applied`.
 * 2. `undoSession(sessionId, ctx)` — rollback manuel déclenché par
 *    l'admin. Itère les actions `applied` en ordre inverse, appelle
 *    leur `undo()`, passe à `undone`. Idempotent : relancer ne
 *    retouche pas les actions déjà `undone` ou `failed`.
 *
 * Le registry enforce le contrat `OnboardingActionDefinition` (R8 du
 * plan jalon 3) : `undo` et `canUndo` sont obligatoires, un payload
 * doit valider le `schema` Zod de l'action à l'insertion.
 *
 * Rate limit : 50 ms de délai entre deux actions consécutives pour
 * laisser de la marge à discord.js sur les buckets Discord (R2). Les
 * 429 émis en aval par discord.js sont gérés par son client natif.
 */

const DELAY_BETWEEN_ACTIONS_MS = 50;

/** Options de construction de l'executor. */
export interface CreateOnboardingExecutorOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly logger: Logger;
  /** Override du délai entre actions (tests). */
  readonly delayBetweenActionsMs?: number;
}

/** Résultat d'un `applyActions`. */
export interface ApplyActionsResult {
  readonly ok: boolean;
  readonly appliedCount: number;
  readonly failedAt?: number;
  readonly error?: string;
  /** IDs externes (Discord snowflakes) dans l'ordre d'application. */
  readonly externalIds: readonly (string | null)[];
}

/** Résultat d'un `undoSession`. */
export interface UndoSessionResult {
  readonly ok: boolean;
  readonly undoneCount: number;
  /** Nombre d'actions qu'on n'a pas pu défaire (canUndo false). */
  readonly skippedCount: number;
  readonly error?: string;
}

/** Surface publique de l'executor. */
export interface OnboardingExecutor {
  readonly registerAction: <P, R>(def: OnboardingActionDefinition<P, R>) => void;
  readonly hasAction: (type: string) => boolean;
  readonly applyActions: (
    sessionId: OnboardingSessionId,
    requests: readonly OnboardingActionRequest[],
    ctx: OnboardingActionContext,
  ) => Promise<ApplyActionsResult>;
  readonly undoSession: (
    sessionId: OnboardingSessionId,
    ctx: OnboardingActionContext,
  ) => Promise<UndoSessionResult>;
}

interface ActionRow {
  readonly id: Ulid;
  readonly sessionId: Ulid;
  readonly sequence: number;
  readonly actionType: string;
  readonly actionPayload: Readonly<Record<string, unknown>>;
  readonly status: OnboardingActionStatus;
  readonly externalId: string | null;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly error: string | null;
  readonly appliedAt: string | null;
  readonly undoneAt: string | null;
}

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const assertDefinitionValid = <P, R>(def: OnboardingActionDefinition<P, R>): void => {
  if (typeof def.type !== 'string' || def.type.length === 0) {
    throw new ValidationError('OnboardingExecutor.registerAction : type vide.');
  }
  if (typeof def.apply !== 'function') {
    throw new ValidationError(`OnboardingExecutor.registerAction : "${def.type}" sans apply.`);
  }
  if (typeof def.undo !== 'function') {
    throw new ValidationError(
      `OnboardingExecutor.registerAction : "${def.type}" sans undo. Toute action doit exposer un undo, même no-op.`,
    );
  }
  if (def.canUndo === undefined) {
    throw new ValidationError(
      `OnboardingExecutor.registerAction : "${def.type}" sans canUndo. Déclarer explicitement true | false | (result) => boolean.`,
    );
  }
  if (def.schema === undefined) {
    throw new ValidationError(`OnboardingExecutor.registerAction : "${def.type}" sans schema Zod.`);
  }
};

// ─── DB helpers (split PG / SQLite, même pattern que audit.ts) ────

const insertPendingRows = async <D extends DbDriver>(
  client: DbClient<D>,
  rows: readonly ActionRow[],
): Promise<void> => {
  if (rows.length === 0) return;
  if (client.driver === 'pg') {
    const { onboardingActionsLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db.insert(onboardingActionsLog).values(
      rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        sequence: r.sequence,
        actionType: r.actionType,
        actionPayload: r.actionPayload,
        status: r.status,
      })),
    );
    return;
  }
  const { onboardingActionsLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  for (const r of rows) {
    sqlite.db
      .insert(onboardingActionsLog)
      .values({
        id: r.id,
        sessionId: r.sessionId,
        sequence: r.sequence,
        actionType: r.actionType,
        actionPayload: r.actionPayload,
        status: r.status,
      })
      .run();
  }
};

const updateRowApplied = async <D extends DbDriver>(
  client: DbClient<D>,
  rowId: Ulid,
  externalId: string | null,
  result: Readonly<Record<string, unknown>> | null,
): Promise<void> => {
  const appliedAt = new Date();
  if (client.driver === 'pg') {
    const { onboardingActionsLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .update(onboardingActionsLog)
      .set({ status: 'applied', externalId, result, appliedAt })
      .where(eq(onboardingActionsLog.id, rowId));
    return;
  }
  const { onboardingActionsLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  sqlite.db
    .update(onboardingActionsLog)
    .set({ status: 'applied', externalId, result, appliedAt: toCanonicalDate(appliedAt) })
    .where(eq(onboardingActionsLog.id, rowId))
    .run();
};

const updateRowFailed = async <D extends DbDriver>(
  client: DbClient<D>,
  rowId: Ulid,
  error: string,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { onboardingActionsLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .update(onboardingActionsLog)
      .set({ status: 'failed', error })
      .where(eq(onboardingActionsLog.id, rowId));
    return;
  }
  const { onboardingActionsLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  sqlite.db
    .update(onboardingActionsLog)
    .set({ status: 'failed', error })
    .where(eq(onboardingActionsLog.id, rowId))
    .run();
};

const updateRowUndone = async <D extends DbDriver>(
  client: DbClient<D>,
  rowId: Ulid,
): Promise<void> => {
  const undoneAt = new Date();
  if (client.driver === 'pg') {
    const { onboardingActionsLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .update(onboardingActionsLog)
      .set({ status: 'undone', undoneAt })
      .where(eq(onboardingActionsLog.id, rowId));
    return;
  }
  const { onboardingActionsLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  sqlite.db
    .update(onboardingActionsLog)
    .set({ status: 'undone', undoneAt: toCanonicalDate(undoneAt) })
    .where(eq(onboardingActionsLog.id, rowId))
    .run();
};

const selectSessionRows = async <D extends DbDriver>(
  client: DbClient<D>,
  sessionId: Ulid,
  order: 'asc' | 'desc' = 'asc',
): Promise<readonly ActionRow[]> => {
  if (client.driver === 'pg') {
    const { onboardingActionsLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select()
      .from(onboardingActionsLog)
      .where(eq(onboardingActionsLog.sessionId, sessionId))
      .orderBy(
        order === 'asc' ? asc(onboardingActionsLog.sequence) : desc(onboardingActionsLog.sequence),
      );
    return rows.map((r) => ({
      id: r.id as Ulid,
      sessionId: r.sessionId as Ulid,
      sequence: r.sequence,
      actionType: r.actionType,
      actionPayload: r.actionPayload as Readonly<Record<string, unknown>>,
      status: r.status,
      externalId: r.externalId,
      result: r.result as Readonly<Record<string, unknown>> | null,
      error: r.error,
      appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
      undoneAt: r.undoneAt ? r.undoneAt.toISOString() : null,
    }));
  }
  const { onboardingActionsLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const rows = sqlite.db
    .select()
    .from(onboardingActionsLog)
    .where(eq(onboardingActionsLog.sessionId, sessionId))
    .orderBy(
      order === 'asc' ? asc(onboardingActionsLog.sequence) : desc(onboardingActionsLog.sequence),
    )
    .all();
  return rows.map((r) => ({
    id: r.id as Ulid,
    sessionId: r.sessionId as Ulid,
    sequence: r.sequence,
    actionType: r.actionType,
    actionPayload: r.actionPayload as Readonly<Record<string, unknown>>,
    status: r.status,
    externalId: r.externalId,
    result: r.result as Readonly<Record<string, unknown>> | null,
    error: r.error,
    appliedAt: r.appliedAt,
    undoneAt: r.undoneAt,
  }));
};

/** Crée un OnboardingExecutor. */
export function createOnboardingExecutor<D extends DbDriver>(
  options: CreateOnboardingExecutorOptions<D>,
): OnboardingExecutor {
  const { client, logger } = options;
  const delay = options.delayBetweenActionsMs ?? DELAY_BETWEEN_ACTIONS_MS;
  const registry = new Map<string, OnboardingActionDefinition<unknown, unknown>>();
  const log = logger.child({ component: 'onboarding.executor' });

  const registerAction = <P, R>(def: OnboardingActionDefinition<P, R>): void => {
    assertDefinitionValid(def);
    if (registry.has(def.type)) {
      throw new ValidationError(
        `OnboardingExecutor.registerAction : type "${def.type}" déjà enregistré.`,
      );
    }
    registry.set(def.type, def as unknown as OnboardingActionDefinition<unknown, unknown>);
  };

  const resolveDef = (type: string): OnboardingActionDefinition<unknown, unknown> => {
    const def = registry.get(type);
    if (!def) {
      throw new ValidationError(`OnboardingExecutor : type d'action "${type}" inconnu.`);
    }
    return def;
  };

  // Valide chaque payload contre le schema de l'action. Lève si un
  // payload est invalide. Fait AVANT la moindre écriture Discord —
  // on refuse un batch invalide sans effet de bord.
  const validateRequests = (requests: readonly OnboardingActionRequest[]): void => {
    for (const req of requests) {
      const def = resolveDef(req.type);
      const parse = def.schema.safeParse(req.payload);
      if (!parse.success) {
        throw new ValidationError(
          `OnboardingExecutor : payload invalide pour "${req.type}" — ${parse.error.issues[0]?.message ?? 'raison inconnue'}.`,
        );
      }
    }
  };

  const performUndoForSession = async (
    sessionId: OnboardingSessionId,
    ctx: OnboardingActionContext,
  ): Promise<{ undone: number; skipped: number }> => {
    const rows = await selectSessionRows(client, sessionId, 'desc');
    let undone = 0;
    let skipped = 0;
    for (const row of rows) {
      if (row.status !== 'applied') continue;
      const def = registry.get(row.actionType);
      if (!def) {
        log.warn('undo : action type inconnu, ligne sautée', {
          rowId: row.id,
          actionType: row.actionType,
        });
        skipped += 1;
        continue;
      }
      const canUndo = typeof def.canUndo === 'function' ? def.canUndo(row.result) : def.canUndo;
      if (!canUndo) {
        skipped += 1;
        continue;
      }
      try {
        await def.undo(ctx, row.actionPayload, row.result);
        await updateRowUndone(client, row.id);
        undone += 1;
      } catch (err) {
        log.error(
          'undo : échec, ligne laissée en applied',
          err instanceof Error ? err : new Error(String(err)),
          { rowId: row.id, actionType: row.actionType },
        );
        skipped += 1;
      }
    }
    return { undone, skipped };
  };

  const applyActions = async (
    sessionId: OnboardingSessionId,
    requests: readonly OnboardingActionRequest[],
    ctx: OnboardingActionContext,
  ): Promise<ApplyActionsResult> => {
    validateRequests(requests);

    // Batch insert de toutes les actions en status `pending`.
    const pendingRows: ActionRow[] = requests.map((req, index) => ({
      id: newUlid() as Ulid,
      sessionId,
      sequence: index,
      actionType: req.type,
      actionPayload: (req.payload ?? {}) as Readonly<Record<string, unknown>>,
      status: 'pending',
      externalId: null,
      result: null,
      error: null,
      appliedAt: null,
      undoneAt: null,
    }));
    await insertPendingRows(client, pendingRows);

    const externalIds: (string | null)[] = [];

    for (let i = 0; i < requests.length; i += 1) {
      const row = pendingRows[i];
      const req = requests[i];
      if (!row || !req) continue;
      const def = resolveDef(req.type);
      if (i > 0) await sleep(delay);
      try {
        const result = (await def.apply(ctx, req.payload)) as
          | { id?: string }
          | Record<string, unknown>;
        const externalId =
          typeof (result as { id?: unknown }).id === 'string'
            ? (result as { id: string }).id
            : null;
        await updateRowApplied(
          client,
          row.id,
          externalId,
          (result ?? {}) as Readonly<Record<string, unknown>>,
        );
        externalIds.push(externalId);
      } catch (err) {
        const message = errorMessage(err);
        await updateRowFailed(client, row.id, message);
        log.warn('action en échec, rollback auto en cours', {
          rowId: row.id,
          actionType: req.type,
          error: message,
        });
        // Rollback auto des actions déjà appliquées.
        await performUndoForSession(sessionId, ctx);
        return { ok: false, appliedCount: i, failedAt: i, error: message, externalIds };
      }
    }

    return {
      ok: true,
      appliedCount: requests.length,
      externalIds,
    };
  };

  const undoSession = async (
    sessionId: OnboardingSessionId,
    ctx: OnboardingActionContext,
  ): Promise<UndoSessionResult> => {
    try {
      const { undone, skipped } = await performUndoForSession(sessionId, ctx);
      return { ok: true, undoneCount: undone, skippedCount: skipped };
    } catch (err) {
      return {
        ok: false,
        undoneCount: 0,
        skippedCount: 0,
        error: errorMessage(err),
      };
    }
  };

  return {
    registerAction,
    hasAction: (type) => registry.has(type),
    applyActions,
    undoSession,
  };
}
