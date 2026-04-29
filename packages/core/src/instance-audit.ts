import {
  type AuditActor,
  type AuditSeverity,
  type Iso8601DateTime,
  newUlid,
  type Ulid,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { and, desc, eq, lt } from 'drizzle-orm';

/**
 * `instanceAuditService` (jalon 7 PR 7.2 follow-up).
 *
 * Journal append-only pour les événements d'instance (rotation token,
 * ajout/retrait d'owner, changement d'URL d'accès, etc.). Backé par
 * la table `instance_audit_log` (cf. `packages/db/src/schema/{pg,sqlite}.ts`).
 *
 * Pourquoi un service séparé d'`auditService` ? L'audit guild-scoped
 * exige un `guildId` non-null (FK vers `guilds`). Les événements
 * d'instance sont par construction sans guild — on ne veut ni casser
 * la FK, ni rendre le `guildId` nullable sur l'audit existant
 * (cascades, indexes, sémantique). Avoir deux journaux distincts
 * isole les concerns sans mélanger les requêtes.
 *
 * Lecture restée volontairement minimale (filtre par action, par
 * actor, par cursor) — les besoins UI viendront avec la page
 * « historique admin » d'une PR ultérieure.
 */

/** Identifiants des événements scope-instance. Constantes vs strings libres → ferme la surface. */
export const INSTANCE_AUDIT_ACTIONS = {
  /** Rotation du token bot Discord. */
  TOKEN_ROTATED: 'instance.token.rotated',
  /** Modification App ID + Public Key. */
  APP_UPDATED: 'instance.app.updated',
  /** Rotation du Client Secret OAuth. */
  OAUTH_ROTATED: 'instance.oauth.rotated',
  /** Modification de l'identité du bot (nom / avatar / description). */
  IDENTITY_UPDATED: 'instance.identity.updated',
  /** Token bot révélé via la route `/admin/discord/reveal-token`. */
  TOKEN_REVEALED: 'instance.token.revealed',
  /** URL principale modifiée. */
  BASE_URL_UPDATED: 'instance.base_url.updated',
  /** URL additionnelle ajoutée. */
  URL_ADDED: 'instance.url.added',
  /** URL additionnelle retirée. */
  URL_REMOVED: 'instance.url.removed',
  /** Owner ajouté. */
  OWNER_ADDED: 'instance.owner.added',
  /** Owner retiré. */
  OWNER_REMOVED: 'instance.owner.removed',
  /** Premier owner auto-claim au login post-setup. */
  OWNER_CLAIMED: 'instance.owner.claimed',
} as const satisfies Readonly<Record<string, string>>;

export type InstanceAuditAction =
  (typeof INSTANCE_AUDIT_ACTIONS)[keyof typeof INSTANCE_AUDIT_ACTIONS];

/** Cible d'un événement d'instance — opaque, le service ne valide pas la sémantique. */
export interface InstanceAuditTarget {
  readonly type: string;
  readonly id: string;
}

/** Entrée à logger. */
export interface InstanceAuditEntry {
  readonly action: InstanceAuditAction;
  readonly actor: AuditActor;
  readonly severity: AuditSeverity;
  readonly target?: InstanceAuditTarget;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Forme retournée par `query()`. */
export interface InstanceAuditRecord {
  readonly id: Ulid;
  readonly actor: AuditActor;
  readonly action: InstanceAuditAction;
  readonly target: InstanceAuditTarget | null;
  readonly severity: AuditSeverity;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601DateTime;
}

/** Filtres lecture. */
export interface InstanceAuditQueryOptions {
  readonly action?: InstanceAuditAction;
  readonly actorType?: AuditActor['type'];
  readonly limit?: number;
  /** Cursor pagination via ULID décroissant. */
  readonly cursor?: Ulid;
}

export interface InstanceAuditService {
  readonly log: (entry: InstanceAuditEntry) => Promise<Ulid>;
  readonly query: (options?: InstanceAuditQueryOptions) => Promise<readonly InstanceAuditRecord[]>;
}

export interface CreateInstanceAuditServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
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

/** Forme commune retournée par les deux variants de SELECT. */
interface RawRow {
  readonly id: Ulid;
  readonly actorType: AuditActor['type'];
  readonly actorId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly severity: AuditSeverity;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Date | string;
}

const decodeCreatedAt = (value: Date | string): Iso8601DateTime =>
  (value instanceof Date ? toCanonicalDate(value) : value) as Iso8601DateTime;

const rowToRecord = (row: RawRow): InstanceAuditRecord => {
  const actor: AuditActor =
    row.actorType === 'system'
      ? { type: 'system' }
      : row.actorType === 'user'
        ? { type: 'user', id: (row.actorId ?? '') as never }
        : { type: 'module', id: (row.actorId ?? '') as never };
  const target: InstanceAuditTarget | null =
    row.targetType !== null && row.targetId !== null
      ? { type: row.targetType, id: row.targetId }
      : null;
  return {
    id: row.id,
    actor,
    action: row.action as InstanceAuditAction,
    target,
    severity: row.severity,
    metadata: row.metadata,
    createdAt: decodeCreatedAt(row.createdAt),
  };
};

/**
 * Construit un `instanceAuditService` adossé à la table
 * `instance_audit_log`. Aucune validation métier : les `action`
 * acceptées sont contrôlées par les types (`InstanceAuditAction`)
 * côté appelant. Le service trust que l'appelant lui passe une
 * valeur valide.
 */
export function createInstanceAuditService<D extends DbDriver>(
  options: CreateInstanceAuditServiceOptions<D>,
): InstanceAuditService {
  const { client } = options;

  return {
    async log(entry) {
      const id = newUlid();
      const actorId = resolveActorId(entry.actor);
      const metadata = entry.metadata ?? {};
      if (client.driver === 'pg') {
        const { instanceAuditLog } = pgSchema;
        const pg = client as DbClient<'pg'>;
        await pg.db.insert(instanceAuditLog).values({
          id,
          actorType: entry.actor.type,
          actorId,
          action: entry.action,
          targetType: entry.target?.type ?? null,
          targetId: entry.target?.id ?? null,
          severity: entry.severity,
          metadata,
          createdAt: new Date(),
        });
        return id;
      }
      const { instanceAuditLog } = sqliteSchema;
      const sqlite = client as DbClient<'sqlite'>;
      await sqlite.db.insert(instanceAuditLog).values({
        id,
        actorType: entry.actor.type,
        actorId,
        action: entry.action,
        targetType: entry.target?.type ?? null,
        targetId: entry.target?.id ?? null,
        severity: entry.severity,
        metadata,
        createdAt: toCanonicalDate(new Date()),
      });
      return id;
    },

    async query(filters = {}) {
      const limit = filters.limit ?? 50;
      if (client.driver === 'pg') {
        const { instanceAuditLog } = pgSchema;
        const pg = client as DbClient<'pg'>;
        const clauses = [
          filters.action ? eq(instanceAuditLog.action, filters.action) : undefined,
          filters.actorType ? eq(instanceAuditLog.actorType, filters.actorType) : undefined,
          filters.cursor ? lt(instanceAuditLog.id, filters.cursor) : undefined,
        ].filter((c): c is NonNullable<typeof c> => c !== undefined);
        const rows = await pg.db
          .select()
          .from(instanceAuditLog)
          .where(clauses.length > 0 ? and(...clauses) : undefined)
          .orderBy(desc(instanceAuditLog.id))
          .limit(limit);
        return rows.map((r) => rowToRecord(r as unknown as RawRow));
      }
      const { instanceAuditLog } = sqliteSchema;
      const sqlite = client as DbClient<'sqlite'>;
      const clauses = [
        filters.action ? eq(instanceAuditLog.action, filters.action) : undefined,
        filters.actorType ? eq(instanceAuditLog.actorType, filters.actorType) : undefined,
        filters.cursor ? lt(instanceAuditLog.id, filters.cursor) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);
      const rows = sqlite.db
        .select()
        .from(instanceAuditLog)
        .where(clauses.length > 0 ? and(...clauses) : undefined)
        .orderBy(desc(instanceAuditLog.id))
        .limit(limit)
        .all();
      return rows.map((r) => rowToRecord(r as unknown as RawRow));
    },
  };
}
