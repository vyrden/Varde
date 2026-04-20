import {
  type ActionId,
  type AuditActor,
  type AuditEntry,
  type AuditLogRecord,
  type AuditService,
  type AuditSeverity,
  type AuditTarget,
  type GuildId,
  type Iso8601DateTime,
  type ModuleId,
  newUlid,
  type Ulid,
  ValidationError,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { and, desc, eq, gte, lt } from 'drizzle-orm';

/**
 * AuditService : journal unifié append-only des actions significatives
 * (voir ADR 0001 `audit_log`). Écritures uniquement via ce service ;
 * la lecture brute de la table par un module est interdite (PR 1.5).
 *
 * Enrichissement automatique sur `log()` :
 * - `id` ULID généré côté applicatif.
 * - `created_at` posé à maintenant.
 * - `module_id` injecté depuis le scope fourni à la factory si non
 *   fourni par l'entrée.
 *
 * `query()` expose une lecture filtrée réservée au core et au
 * dashboard interne. `purge({ guildId, olderThan })` est consommé par
 * la tâche de rétention planifiée (PR 1.4).
 */

/** Scope d'un service d'audit (module auteur ou "core"). */
export type AuditScope =
  | { readonly kind: 'core' }
  | { readonly kind: 'module'; readonly moduleId: ModuleId };

/** Options de construction. */
export interface CreateAuditServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly scope?: AuditScope;
}

/** Filtres de lecture d'audit. */
export interface AuditQueryOptions {
  readonly guildId?: GuildId;
  readonly action?: ActionId;
  readonly actorType?: AuditActor['type'];
  readonly severity?: AuditSeverity;
  readonly since?: Date | Iso8601DateTime;
  readonly until?: Date | Iso8601DateTime;
  readonly limit?: number;
}

/** Options de purge par rétention. */
export interface AuditPurgeOptions {
  readonly guildId: GuildId;
  readonly olderThan: Date | Iso8601DateTime;
}

/**
 * Extension du contrat `AuditService` avec les opérations de lecture
 * et de purge réservées au core.
 */
export interface CoreAuditService extends AuditService {
  readonly query: (options?: AuditQueryOptions) => Promise<readonly AuditLogRecord[]>;
  readonly purge: (options: AuditPurgeOptions) => Promise<number>;
}

interface AuditRow {
  readonly id: Ulid;
  readonly guildId: GuildId;
  readonly actorType: AuditActor['type'];
  readonly actorId: string | null;
  readonly action: ActionId;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly moduleId: ModuleId | null;
  readonly severity: AuditSeverity;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601DateTime;
}

const resolveActorId = (actor: AuditActor): string | null => {
  switch (actor.type) {
    case 'user':
      return actor.id;
    case 'module':
      return actor.id;
    case 'system':
      return null;
  }
};

const resolveTarget = (
  target: AuditTarget | undefined,
): { readonly type: string | null; readonly id: string | null } => {
  if (!target) {
    return { type: null, id: null };
  }
  return { type: target.type, id: target.id };
};

const resolveModuleId = (scope: AuditScope, actor: AuditActor): ModuleId | null => {
  if (scope.kind === 'module') {
    return scope.moduleId;
  }
  if (actor.type === 'module') {
    return actor.id;
  }
  return null;
};

const requireGuildId = (entry: AuditEntry): GuildId => {
  if (!entry.guildId) {
    throw new ValidationError('AuditService.log : guildId requis', {
      metadata: { action: entry.action },
    });
  }
  return entry.guildId;
};

const insertRow = async <D extends DbDriver>(client: DbClient<D>, row: AuditRow): Promise<void> => {
  if (client.driver === 'pg') {
    const { auditLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db.insert(auditLog).values({
      id: row.id,
      guildId: row.guildId,
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType as 'user' | 'channel' | 'role' | 'message' | null,
      targetId: row.targetId,
      moduleId: row.moduleId,
      severity: row.severity,
      metadata: row.metadata,
      createdAt: new Date(row.createdAt),
    });
    return;
  }
  const { auditLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  await sqlite.db.insert(auditLog).values({
    id: row.id,
    guildId: row.guildId,
    actorType: row.actorType,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType as 'user' | 'channel' | 'role' | 'message' | null,
    targetId: row.targetId,
    moduleId: row.moduleId,
    severity: row.severity,
    metadata: row.metadata,
    createdAt: row.createdAt,
  });
};

const selectRows = async <D extends DbDriver>(
  client: DbClient<D>,
  filters: AuditQueryOptions,
): Promise<readonly AuditLogRecord[]> => {
  const limit = filters.limit ?? 100;
  const sinceIso = filters.since ? toCanonicalDate(filters.since) : undefined;
  const untilIso = filters.until ? toCanonicalDate(filters.until) : undefined;

  if (client.driver === 'pg') {
    const { auditLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const clauses = [
      filters.guildId ? eq(auditLog.guildId, filters.guildId) : undefined,
      filters.action ? eq(auditLog.action, filters.action) : undefined,
      filters.actorType ? eq(auditLog.actorType, filters.actorType) : undefined,
      filters.severity ? eq(auditLog.severity, filters.severity) : undefined,
      sinceIso ? gte(auditLog.createdAt, new Date(sinceIso)) : undefined,
      untilIso ? lt(auditLog.createdAt, new Date(untilIso)) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const rows = await pg.db
      .select()
      .from(auditLog)
      .where(clauses.length > 0 ? and(...clauses) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id as Ulid,
      guildId: r.guildId as GuildId,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action as ActionId,
      targetType: r.targetType,
      targetId: r.targetId,
      moduleId: (r.moduleId ?? null) as ModuleId | null,
      severity: r.severity,
      metadata: (r.metadata as Readonly<Record<string, unknown>>) ?? {},
      createdAt: toCanonicalDate(r.createdAt),
    }));
  }

  const { auditLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const clauses = [
    filters.guildId ? eq(auditLog.guildId, filters.guildId) : undefined,
    filters.action ? eq(auditLog.action, filters.action) : undefined,
    filters.actorType ? eq(auditLog.actorType, filters.actorType) : undefined,
    filters.severity ? eq(auditLog.severity, filters.severity) : undefined,
    sinceIso ? gte(auditLog.createdAt, sinceIso) : undefined,
    untilIso ? lt(auditLog.createdAt, untilIso) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows = sqlite.db
    .select()
    .from(auditLog)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id as Ulid,
    guildId: r.guildId as GuildId,
    actorType: r.actorType,
    actorId: r.actorId,
    action: r.action as ActionId,
    targetType: r.targetType,
    targetId: r.targetId,
    moduleId: (r.moduleId ?? null) as ModuleId | null,
    severity: r.severity,
    metadata: (r.metadata as Readonly<Record<string, unknown>>) ?? {},
    createdAt: r.createdAt as Iso8601DateTime,
  }));
};

const purgeRows = async <D extends DbDriver>(
  client: DbClient<D>,
  options: AuditPurgeOptions,
): Promise<number> => {
  const olderThanIso = toCanonicalDate(options.olderThan);
  if (client.driver === 'pg') {
    const { auditLog } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const result = await pg.db
      .delete(auditLog)
      .where(
        and(eq(auditLog.guildId, options.guildId), lt(auditLog.createdAt, new Date(olderThanIso))),
      )
      .returning({ id: auditLog.id });
    return result.length;
  }
  const { auditLog } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const result = sqlite.db
    .delete(auditLog)
    .where(and(eq(auditLog.guildId, options.guildId), lt(auditLog.createdAt, olderThanIso)))
    .run();
  return Number(result.changes ?? 0);
};

export function createAuditService<D extends DbDriver>(
  options: CreateAuditServiceOptions<D>,
): CoreAuditService {
  const { client } = options;
  const scope: AuditScope = options.scope ?? { kind: 'core' };

  return {
    async log(entry) {
      const guildId = requireGuildId(entry);
      const target = resolveTarget(entry.target);
      const row: AuditRow = {
        id: newUlid(),
        guildId,
        actorType: entry.actor.type,
        actorId: resolveActorId(entry.actor),
        action: entry.action,
        targetType: target.type,
        targetId: target.id,
        moduleId: resolveModuleId(scope, entry.actor),
        severity: entry.severity,
        metadata: entry.metadata ?? {},
        createdAt: toCanonicalDate(new Date()),
      };
      await insertRow(client, row);
    },

    async query(filters = {}) {
      return selectRows(client, filters);
    },

    async purge(purgeOptions) {
      return purgeRows(client, purgeOptions);
    },
  };
}
