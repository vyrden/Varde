import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Variante SQLite du schéma du core. Mirroir de `./pg.ts`. Différences
 * dictées par SQLite :
 * - Tous les textes en `TEXT` (pas de `VARCHAR`).
 * - Timestamps stockés en ISO 8601 (`TEXT`), par défaut `CURRENT_TIMESTAMP`
 *   au format `YYYY-MM-DD HH:MM:SS` que l'application normalise.
 * - Booléens via `integer({ mode: 'boolean' })`.
 * - Colonnes JSON via `text({ mode: 'json' })` (parse applicatif).
 * - Blobs via `blob({ mode: 'buffer' })` pour le keystore.
 * - Aucun index partiel (non supporté avant SQLite 3.8 partout) : l'index
 *   `idx_onboarding_expires` est posé en complet.
 */

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
const nowIso = sql`CURRENT_TIMESTAMP`;

export const guilds = sqliteTable(
  'guilds',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    locale: text('locale').notNull().default('en'),
    joinedAt: text('joined_at').notNull().default(nowIso),
    leftAt: text('left_at'),
    createdAt: text('created_at').notNull().default(nowIso),
    updatedAt: text('updated_at').notNull().default(nowIso),
  },
  (t) => [index('idx_guilds_left_at').on(t.leftAt)],
);

export const guildConfig = sqliteTable('guild_config', {
  guildId: text('guild_id')
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  config: text('config', { mode: 'json' })
    .$type<Readonly<Record<string, unknown>>>()
    .notNull()
    .default(sql`'{}'`),
  version: integer('version').notNull().default(1),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at').notNull().default(nowIso),
});

export const modulesRegistry = sqliteTable(
  'modules_registry',
  {
    id: text('id').primaryKey(),
    version: text('version').notNull(),
    manifest: text('manifest', { mode: 'json' })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull(),
    schemaVersion: integer('schema_version').notNull(),
    loadedAt: text('loaded_at').notNull().default(nowIso),
  },
  (t) => [index('idx_modules_schema_version').on(t.schemaVersion)],
);

export const guildModules = sqliteTable(
  'guild_modules',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'restrict' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    enabledAt: text('enabled_at'),
    enabledBy: text('enabled_by'),
    disabledAt: text('disabled_at'),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.moduleId] })],
);

export const permissionsRegistry = sqliteTable(
  'permissions_registry',
  {
    id: text('id').primaryKey(),
    moduleId: text('module_id')
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    category: text('category').notNull(),
    defaultLevel: text('default_level').$type<PermissionLevel>().notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [
    index('idx_permissions_module').on(t.moduleId),
    check(
      'permissions_default_level_check',
      sql.raw(`default_level IN (${inList(permissionLevels)})`),
    ),
  ],
);

export const permissionBindings = sqliteTable(
  'permission_bindings',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissionsRegistry.id, { onDelete: 'cascade' }),
    roleId: text('role_id').notNull(),
    grantedBy: text('granted_by'),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.permissionId, t.roleId] }),
    index('idx_bindings_role').on(t.roleId),
  ],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').$type<ActorType>().notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type').$type<TargetType | null>(),
    targetId: text('target_id'),
    moduleId: text('module_id').references(() => modulesRegistry.id, {
      onDelete: 'set null',
    }),
    severity: text('severity').$type<Severity>().notNull(),
    metadata: text('metadata', { mode: 'json' })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text('created_at').notNull().default(nowIso),
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

export const scheduledTasks = sqliteTable(
  'scheduled_tasks',
  {
    id: text('id').primaryKey(),
    jobKey: text('job_key').notNull(),
    moduleId: text('module_id')
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'cascade' }),
    guildId: text('guild_id').references(() => guilds.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<TaskKind>().notNull(),
    payload: text('payload', { mode: 'json' })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull()
      .default(sql`'{}'`),
    runAt: text('run_at').notNull(),
    status: text('status').$type<TaskStatus>().notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull().default(nowIso),
    updatedAt: text('updated_at').notNull().default(nowIso),
  },
  (t) => [
    uniqueIndex('idx_tasks_job_key').on(t.jobKey),
    index('idx_tasks_run_at').on(t.status, t.runAt),
    check('tasks_kind_check', sql.raw(`kind IN (${inList(taskKinds)})`)),
    check('tasks_status_check', sql.raw(`status IN (${inList(taskStatuses)})`)),
  ],
);

export const onboardingSessions = sqliteTable(
  'onboarding_sessions',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    startedBy: text('started_by').notNull(),
    status: text('status').$type<OnboardingStatus>().notNull(),
    mode: text('mode').$type<OnboardingMode>().notNull(),
    answers: text('answers', { mode: 'json' })
      .$type<Readonly<Record<string, unknown>>>()
      .notNull()
      .default(sql`'{}'`),
    plan: text('plan', { mode: 'json' }).$type<Readonly<Record<string, unknown>>>(),
    appliedActions: text('applied_actions', { mode: 'json' })
      .$type<readonly Readonly<Record<string, unknown>>[]>()
      .notNull()
      .default(sql`'[]'`),
    startedAt: text('started_at').notNull().default(nowIso),
    completedAt: text('completed_at'),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [
    index('idx_onboarding_guild_status').on(t.guildId, t.status),
    index('idx_onboarding_expires').on(t.expiresAt),
    check('onboarding_status_check', sql.raw(`status IN (${inList(onboardingStatuses)})`)),
    check('onboarding_mode_check', sql.raw(`mode IN (${inList(onboardingModes)})`)),
  ],
);

export const aiInvocations = sqliteTable(
  'ai_invocations',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    moduleId: text('module_id').references(() => modulesRegistry.id, {
      onDelete: 'set null',
    }),
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptHash: text('prompt_hash').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costEstimate: text('cost_estimate').notNull().default('0'),
    success: integer('success', { mode: 'boolean' }).notNull(),
    error: text('error'),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (t) => [index('idx_ai_guild_created').on(t.guildId, t.createdAt)],
);

export const keystore = sqliteTable(
  'keystore',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modulesRegistry.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(),
    iv: blob('iv', { mode: 'buffer' }).notNull(),
    authTag: blob('auth_tag', { mode: 'buffer' }).notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
    updatedAt: text('updated_at').notNull().default(nowIso),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.moduleId, t.key] })],
);

export const sqliteSchema = {
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

export type SqliteSchema = typeof sqliteSchema;
