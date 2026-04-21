import type {
  GuildId,
  Iso8601DateTime,
  OnboardingDraft,
  OnboardingPresetSource,
  OnboardingSessionRecord,
  OnboardingSessionStatus,
  Ulid,
  UserId,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { and, desc, eq, inArray } from 'drizzle-orm';

/**
 * Repo minimal pour la table `onboarding_sessions`. Les routes
 * `/onboarding/*` (PR 3.4) s'en servent pour créer la session, lire
 * la session active d'une guild, patcher le draft, et faire évoluer
 * le status au fil du cycle builder (draft → previewing → applying
 * → applied → rolled_back).
 *
 * Le repo vit côté API plutôt que dans `@varde/db` : c'est une
 * logique d'orchestration, pas un contrat stable de schéma. L'API
 * est le consommateur principal ; si un module tiers a besoin d'y
 * accéder plus tard (on doute), on promouvra le code.
 *
 * R3 (partial unique guild_id + status IN active) : côté PG
 * l'index strict suffit, côté SQLite on émule par un check
 * applicatif dans `findActiveSessionByGuild` avant `insertSession`.
 * Non-atomique par nature — acceptable V1, un éventuel doublon
 * produirait deux drafts, que l'UI détectera et remontera ; on
 * posera un verrou type advisory lock si le besoin apparaît.
 */

const ACTIVE_STATUSES: readonly OnboardingSessionStatus[] = ['draft', 'previewing', 'applying'];

/**
 * Statuts considérés "courants" côté UI : on inclut `applied` pour
 * que la page `GET /onboarding/current` puisse afficher la session
 * appliquée (vue rollback + compte à rebours). Le set reste plus
 * étroit que `OnboardingSessionStatus` car les statuts terminaux
 * (rolled_back, expired, failed) ne doivent pas coller l'admin sur
 * un écran "Session terminée" ; un terminal → 404 → retour au
 * PresetPicker pour démarrer une nouvelle session.
 */
const CURRENT_STATUSES: readonly OnboardingSessionStatus[] = [
  'draft',
  'previewing',
  'applying',
  'applied',
];

export interface NewOnboardingSession {
  readonly id: Ulid;
  readonly guildId: GuildId;
  readonly startedBy: UserId;
  readonly presetSource: OnboardingPresetSource;
  readonly presetId: string | null;
  readonly draft: OnboardingDraft;
  /** Si `source === 'ai'`, lie la session à l'invocation qui l'a proposée. */
  readonly aiInvocationId?: Ulid | null;
}

export interface OnboardingSessionPatch {
  readonly status?: OnboardingSessionStatus;
  readonly draft?: OnboardingDraft;
  readonly appliedAt?: Date | null;
  readonly expiresAt?: Date | null;
}

const toIso = (d: Date | null): Iso8601DateTime | null =>
  d ? (toCanonicalDate(d) as Iso8601DateTime) : null;

const coerceIso = (raw: unknown): Iso8601DateTime => {
  if (raw instanceof Date) return toCanonicalDate(raw) as Iso8601DateTime;
  if (typeof raw === 'string') return raw as Iso8601DateTime;
  // PG retourne une Date ; SQLite retourne une string. On ne devrait
  // pas tomber ici en pratique, mais un fallback garde le typage
  // honnête.
  return new Date().toISOString() as Iso8601DateTime;
};

const coerceNullableIso = (raw: unknown): Iso8601DateTime | null =>
  raw == null ? null : coerceIso(raw);

const rowToRecord = (row: {
  id: string;
  guildId: string;
  startedBy: string;
  status: OnboardingSessionStatus;
  presetSource: OnboardingPresetSource;
  presetId: string | null;
  aiInvocationId: string | null;
  draft: unknown;
  startedAt: unknown;
  updatedAt: unknown;
  appliedAt: unknown;
  expiresAt: unknown;
}): OnboardingSessionRecord => ({
  id: row.id as Ulid,
  guildId: row.guildId as GuildId,
  startedBy: row.startedBy as UserId,
  status: row.status,
  presetSource: row.presetSource,
  presetId: row.presetId,
  aiInvocationId: row.aiInvocationId as Ulid | null,
  draft: (row.draft ?? {}) as Readonly<Record<string, unknown>>,
  startedAt: coerceIso(row.startedAt),
  updatedAt: coerceIso(row.updatedAt),
  appliedAt: coerceNullableIso(row.appliedAt),
  expiresAt: coerceNullableIso(row.expiresAt),
});

export const findActiveSessionByGuild = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
): Promise<OnboardingSessionRecord | null> => {
  if (client.driver === 'pg') {
    const { onboardingSessions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select()
      .from(onboardingSessions)
      .where(
        and(
          eq(onboardingSessions.guildId, guildId),
          inArray(onboardingSessions.status, ACTIVE_STATUSES),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? rowToRecord(row) : null;
  }
  const { onboardingSessions } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const rows = sqlite.db
    .select()
    .from(onboardingSessions)
    .where(
      and(
        eq(onboardingSessions.guildId, guildId),
        inArray(onboardingSessions.status, ACTIVE_STATUSES),
      ),
    )
    .limit(1)
    .all();
  const row = rows[0];
  return row ? rowToRecord(row) : null;
};

/**
 * Session courante affichée par `GET /onboarding/current`. Comprend
 * `applied` (fenêtre de rollback) en plus des statuts actifs, et
 * retourne la plus récente par `startedAt` si plusieurs matchent
 * (cas limite : une ancienne session `applied` cohabite avec un
 * nouveau draft — on privilégie le nouveau).
 */
export const findCurrentSessionByGuild = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
): Promise<OnboardingSessionRecord | null> => {
  if (client.driver === 'pg') {
    const { onboardingSessions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select()
      .from(onboardingSessions)
      .where(
        and(
          eq(onboardingSessions.guildId, guildId),
          inArray(onboardingSessions.status, CURRENT_STATUSES),
        ),
      )
      .orderBy(desc(onboardingSessions.startedAt))
      .limit(1);
    const row = rows[0];
    return row ? rowToRecord(row) : null;
  }
  const { onboardingSessions } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const rows = sqlite.db
    .select()
    .from(onboardingSessions)
    .where(
      and(
        eq(onboardingSessions.guildId, guildId),
        inArray(onboardingSessions.status, CURRENT_STATUSES),
      ),
    )
    .orderBy(desc(onboardingSessions.startedAt))
    .limit(1)
    .all();
  const row = rows[0];
  return row ? rowToRecord(row) : null;
};

export const findSessionById = async <D extends DbDriver>(
  client: DbClient<D>,
  sessionId: Ulid,
): Promise<OnboardingSessionRecord | null> => {
  if (client.driver === 'pg') {
    const { onboardingSessions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.id, sessionId))
      .limit(1);
    const row = rows[0];
    return row ? rowToRecord(row) : null;
  }
  const { onboardingSessions } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const rows = sqlite.db
    .select()
    .from(onboardingSessions)
    .where(eq(onboardingSessions.id, sessionId))
    .limit(1)
    .all();
  const row = rows[0];
  return row ? rowToRecord(row) : null;
};

export const insertSession = async <D extends DbDriver>(
  client: DbClient<D>,
  record: NewOnboardingSession,
): Promise<OnboardingSessionRecord> => {
  const now = new Date();
  const aiInvocationId = record.aiInvocationId ?? null;
  if (client.driver === 'pg') {
    const { onboardingSessions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db.insert(onboardingSessions).values({
      id: record.id,
      guildId: record.guildId,
      startedBy: record.startedBy,
      status: 'draft' as OnboardingSessionStatus,
      presetSource: record.presetSource,
      presetId: record.presetId,
      aiInvocationId,
      draft: record.draft as Readonly<Record<string, unknown>>,
      startedAt: now,
      updatedAt: now,
    });
  } else {
    const { onboardingSessions } = sqliteSchema;
    const sqlite = client as DbClient<'sqlite'>;
    sqlite.db
      .insert(onboardingSessions)
      .values({
        id: record.id,
        guildId: record.guildId,
        startedBy: record.startedBy,
        status: 'draft' as OnboardingSessionStatus,
        presetSource: record.presetSource,
        presetId: record.presetId,
        aiInvocationId,
        draft: record.draft as Readonly<Record<string, unknown>>,
        startedAt: toCanonicalDate(now),
        updatedAt: toCanonicalDate(now),
      })
      .run();
  }
  return {
    id: record.id,
    guildId: record.guildId,
    startedBy: record.startedBy,
    status: 'draft',
    presetSource: record.presetSource,
    presetId: record.presetId,
    aiInvocationId,
    draft: record.draft as Readonly<Record<string, unknown>>,
    startedAt: toCanonicalDate(now) as Iso8601DateTime,
    updatedAt: toCanonicalDate(now) as Iso8601DateTime,
    appliedAt: null,
    expiresAt: null,
  };
};

export const updateSession = async <D extends DbDriver>(
  client: DbClient<D>,
  sessionId: Ulid,
  patch: OnboardingSessionPatch,
): Promise<void> => {
  const now = new Date();
  if (client.driver === 'pg') {
    const { onboardingSessions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const set: {
      updatedAt: Date;
      status?: OnboardingSessionStatus;
      draft?: Readonly<Record<string, unknown>>;
      appliedAt?: Date | null;
      expiresAt?: Date | null;
    } = { updatedAt: now };
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.draft !== undefined) set.draft = patch.draft as Readonly<Record<string, unknown>>;
    if (patch.appliedAt !== undefined) set.appliedAt = patch.appliedAt;
    if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt;
    await pg.db.update(onboardingSessions).set(set).where(eq(onboardingSessions.id, sessionId));
    return;
  }
  const { onboardingSessions } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const set: {
    updatedAt: string;
    status?: OnboardingSessionStatus;
    draft?: Readonly<Record<string, unknown>>;
    appliedAt?: string | null;
    expiresAt?: string | null;
  } = { updatedAt: toCanonicalDate(now) };
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.draft !== undefined) set.draft = patch.draft as Readonly<Record<string, unknown>>;
  if (patch.appliedAt !== undefined) set.appliedAt = toIso(patch.appliedAt);
  if (patch.expiresAt !== undefined) set.expiresAt = toIso(patch.expiresAt);
  sqlite.db.update(onboardingSessions).set(set).where(eq(onboardingSessions.id, sessionId)).run();
};
