import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Schéma Postgres du core Varde. Décrit les 11 tables posées par l'ADR
 * 0001. Conventions :
 * - PK applicative en ULID `VARCHAR(26)`.
 * - IDs Discord en `VARCHAR(20)` (snowflakes jamais castés en nombre).
 * - Timestamps en `TIMESTAMPTZ` avec `created_at` / `updated_at` par défaut.
 * - Colonnes JSON en `JSONB`.
 * - Enums matérialisés par `TEXT` + `CHECK` pour rester portable vers
 *   SQLite (voir `./sqlite.ts`).
 * - Index nommés `idx_<table>_<usage>`.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

const actorTypes = ['user', 'system', 'module'] as const;
const targetTypes = ['user', 'channel', 'role', 'message'] as const;
const severities = ['info', 'warn', 'error'] as const;
const permissionLevels = ['admin', 'moderator', 'member', 'nobody'] as const;
const taskKinds = ['one_shot', 'recurring'] as const;
const taskStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
const onboardingStatuses = ['in_progress', 'completed', 'aborted', 'rolled_back'] as const;
const onboardingModes = ['fresh', 'existing', 'replay'] as const;

export type ActorType = (typeof actorTypes)[number];
export type TargetType = (typeof targetTypes)[number];
export type Severity = (typeof severities)[number];
export type PermissionLevel = (typeof permissionLevels)[number];
export type TaskKind = (typeof taskKinds)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type OnboardingStatus = (typeof onboardingStatuses)[number];
export type OnboardingMode = (typeof onboardingModes)[number];

const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

/** Registre des serveurs Discord où le bot est actif. */
export const guilds = pgTable(
  'guilds',
  {
    id: varchar('id', { length: 20 }).primaryKey(),
    name: text('name').notNull(),
    locale: varchar('locale', { length: 10 }).notNull().default('en'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_guilds_left_at').on(t.leftAt)],
);

/** Configuration applicative d'un serveur (une ligne par guild). */
export const guildConfig = pgTable('guild_config', {
  guildId: varchar('guild_id', { length: 20 })
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
  version: integer('version').notNull().default(1),
  updatedBy: varchar('updated_by', { length: 20 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Catalogue global des modules connus du core. */
export const modulesRegistry = pgTable(
  'modules_registry',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    version: varchar('version', { length: 64 }).notNull(),
    manifest: jsonb('manifest').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_modules_schema_version').on(t.schemaVersion)],
);

/** Activation d'un module pour un serveur donné. */
export const guildModules = pgTable(
  'guild_modules',
  {
    guildId: varchar('guild_id', { length: 20 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    moduleId: varchar('module_id', { length: 128 })
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'restrict' }),
    enabled: boolean('enabled').notNull().default(false),
    enabledAt: timestamp('enabled_at', { withTimezone: true }),
    enabledBy: varchar('enabled_by', { length: 20 }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.moduleId] })],
);

/** Définitions des permissions applicatives déclarées par les modules. */
export const permissionsRegistry = pgTable(
  'permissions_registry',
  {
    id: varchar('id', { length: 256 }).primaryKey(),
    moduleId: varchar('module_id', { length: 128 })
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    defaultLevel: text('default_level').$type<PermissionLevel>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_permissions_module').on(t.moduleId),
    check(
      'permissions_default_level_check',
      sql.raw(`default_level IN (${inList(permissionLevels)})`),
    ),
  ],
);

/** Mapping permission ↔ rôle Discord, par serveur. */
export const permissionBindings = pgTable(
  'permission_bindings',
  {
    guildId: varchar('guild_id', { length: 20 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    permissionId: varchar('permission_id', { length: 256 })
      .notNull()
      .references(() => permissionsRegistry.id, { onDelete: 'cascade' }),
    roleId: varchar('role_id', { length: 20 }).notNull(),
    grantedBy: varchar('granted_by', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.permissionId, t.roleId] }),
    index('idx_bindings_role').on(t.roleId),
  ],
);

/** Journal unifié, append-only, de toutes les actions significatives. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 20 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').$type<ActorType>().notNull(),
    actorId: varchar('actor_id', { length: 128 }),
    action: varchar('action', { length: 256 }).notNull(),
    targetType: text('target_type').$type<TargetType | null>(),
    targetId: varchar('target_id', { length: 128 }),
    moduleId: varchar('module_id', { length: 128 }).references(() => modulesRegistry.id, {
      onDelete: 'set null',
    }),
    severity: text('severity').$type<Severity>().notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_guild_created').on(t.guildId, t.createdAt),
    index('idx_audit_action').on(t.action),
    index('idx_audit_actor').on(t.actorType, t.actorId),
    index('idx_audit_target').on(t.targetType, t.targetId),
    check('audit_actor_type_check', sql.raw(`actor_type IN (${inList(actorTypes)})`)),
    check(
      'audit_target_type_check',
      sql.raw(`target_type IS NULL OR target_type IN (${inList(targetTypes)})`),
    ),
    check('audit_severity_check', sql.raw(`severity IN (${inList(severities)})`)),
  ],
);

/** Projection DB des tâches planifiées (source de reprise). */
export const scheduledTasks = pgTable(
  'scheduled_tasks',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    jobKey: varchar('job_key', { length: 256 }).notNull(),
    moduleId: varchar('module_id', { length: 128 })
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'cascade' }),
    guildId: varchar('guild_id', { length: 20 }).references(() => guilds.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind').$type<TaskKind>().notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    status: text('status').$type<TaskStatus>().notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_tasks_job_key').on(t.jobKey),
    index('idx_tasks_run_at').on(t.status, t.runAt),
    check('tasks_kind_check', sql.raw(`kind IN (${inList(taskKinds)})`)),
    check('tasks_status_check', sql.raw(`status IN (${inList(taskStatuses)})`)),
  ],
);

/** Sessions d'onboarding en cours ou terminées. */
export const onboardingSessions = pgTable(
  'onboarding_sessions',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 20 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    startedBy: varchar('started_by', { length: 20 }).notNull(),
    status: text('status').$type<OnboardingStatus>().notNull(),
    mode: text('mode').$type<OnboardingMode>().notNull(),
    answers: jsonb('answers').notNull().default(sql`'{}'::jsonb`),
    plan: jsonb('plan'),
    appliedActions: jsonb('applied_actions').notNull().default(sql`'[]'::jsonb`),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('idx_onboarding_guild_status').on(t.guildId, t.status),
    index('idx_onboarding_expires').on(t.expiresAt).where(sql`${t.status} = 'in_progress'`),
    check('onboarding_status_check', sql.raw(`status IN (${inList(onboardingStatuses)})`)),
    check('onboarding_mode_check', sql.raw(`mode IN (${inList(onboardingModes)})`)),
  ],
);

/** Trace de chaque invocation IA. */
export const aiInvocations = pgTable(
  'ai_invocations',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 20 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    moduleId: varchar('module_id', { length: 128 }).references(() => modulesRegistry.id, {
      onDelete: 'set null',
    }),
    purpose: varchar('purpose', { length: 256 }).notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    model: varchar('model', { length: 128 }).notNull(),
    promptHash: varchar('prompt_hash', { length: 64 }).notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costEstimate: numeric('cost_estimate', { precision: 18, scale: 8 }).notNull().default('0'),
    success: boolean('success').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ai_guild_created').on(t.guildId, t.createdAt)],
);

/** Secrets tiers que les modules persistent, chiffrés au repos. */
export const keystore = pgTable(
  'keystore',
  {
    guildId: varchar('guild_id', { length: 20 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    moduleId: varchar('module_id', { length: 128 })
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 128 }).notNull(),
    ciphertext: bytea('ciphertext').notNull(),
    iv: bytea('iv').notNull(),
    authTag: bytea('auth_tag').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.moduleId, t.key] })],
);

/** Table union utile pour l'introspection. */
export const pgSchema = {
  guilds,
  guildConfig,
  modulesRegistry,
  guildModules,
  permissionsRegistry,
  permissionBindings,
  auditLog,
  scheduledTasks,
  onboardingSessions,
  aiInvocations,
  keystore,
} as const;

export type PgSchema = typeof pgSchema;
