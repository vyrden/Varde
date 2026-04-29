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
const onboardingStatuses = [
  'draft',
  'previewing',
  'applying',
  'applied',
  'rolled_back',
  'expired',
  'failed',
] as const;
const onboardingPresetSources = ['blank', 'preset', 'ai'] as const;
const onboardingActionStatuses = ['pending', 'applied', 'undone', 'failed'] as const;

export type ActorType = (typeof actorTypes)[number];
export type TargetType = (typeof targetTypes)[number];
export type Severity = (typeof severities)[number];
export type PermissionLevel = (typeof permissionLevels)[number];
export type TaskKind = (typeof taskKinds)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type OnboardingStatus = (typeof onboardingStatuses)[number];
export type OnboardingPresetSource = (typeof onboardingPresetSources)[number];
export type OnboardingActionStatus = (typeof onboardingActionStatuses)[number];

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

/**
 * Sessions d'onboarding : l'état d'une construction de serveur en
 * cours, une fois applied, ou rollbackée. Le modèle est un builder
 * interactif (ADR 0007) — le `draft` JSONB contient l'arbre
 * rôles / catégories / salons / configs-module que l'admin édite
 * avant apply. Chaque action effectivement appliquée vit dans
 * `onboarding_actions_log` (pas en JSON ici) pour permettre le
 * rollback granulaire et l'audit par ligne.
 *
 * Transitions valides :
 *   draft → previewing → applying → applied
 *                                  ↘  failed (undo auto)
 *   applied → rolled_back (dans la fenêtre de 30 min)
 *   applied → expired (après 30 min, gel)
 *
 * Un seul session « active » (`previewing` / `applying`) par guild
 * à la fois — contrainte via partial unique index côté PG, trigger
 * côté SQLite (risque R3 du plan jalon 3).
 */
export const onboardingSessions = pgTable(
  'onboarding_sessions',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    guildId: varchar('guild_id', { length: 20 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    startedBy: varchar('started_by', { length: 20 }).notNull(),
    status: text('status').$type<OnboardingStatus>().notNull(),
    presetSource: text('preset_source').$type<OnboardingPresetSource>().notNull(),
    presetId: varchar('preset_id', { length: 128 }),
    aiInvocationId: varchar('ai_invocation_id', { length: 26 }),
    draft: jsonb('draft').notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_onboarding_guild_status').on(t.guildId, t.status),
    index('idx_onboarding_expires').on(t.expiresAt).where(sql`${t.status} = 'applied'`),
    // Partial unique : une seule session active par guild.
    uniqueIndex('idx_onboarding_active_per_guild')
      .on(t.guildId)
      .where(sql`${t.status} IN ('draft', 'previewing', 'applying')`),
    check('onboarding_status_check', sql.raw(`status IN (${inList(onboardingStatuses)})`)),
    check(
      'onboarding_preset_source_check',
      sql.raw(`preset_source IN (${inList(onboardingPresetSources)})`),
    ),
  ],
);

/**
 * Journal des actions appliquées dans une session d'onboarding. Une
 * ligne par action tentée, dans l'ordre d'exécution (sequence). Le
 * rollback s'appuie sur ce journal en ordre inverse : chaque ligne
 * `applied` voit son `undo()` appelé, puis passe à `undone`.
 */
export const onboardingActionsLog = pgTable(
  'onboarding_actions_log',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    sessionId: varchar('session_id', { length: 26 })
      .notNull()
      .references(() => onboardingSessions.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    actionType: varchar('action_type', { length: 128 }).notNull(),
    actionPayload: jsonb('action_payload').notNull(),
    status: text('status').$type<OnboardingActionStatus>().notNull(),
    externalId: varchar('external_id', { length: 64 }),
    result: jsonb('result'),
    error: text('error'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('idx_onboarding_actions_session_sequence').on(t.sessionId, t.sequence),
    check(
      'onboarding_action_status_check',
      sql.raw(`status IN (${inList(onboardingActionStatuses)})`),
    ),
  ],
);

/**
 * Trace de chaque invocation IA (ADR 0007). Source de vérité pour :
 * - le quota journalier par instance (R4 : count sur `created_at`
 *   > now() - 24h)
 * - le rate-limit per-user (actor_id × purpose sur l'heure courante)
 * - le rejeu / debug d'un appel spécifique
 * - le monitoring coût (inputTokens × outputTokens × costEstimate).
 *
 * `actorId` est l'ID Discord de l'user qui a déclenché l'appel (admin
 * du dashboard). `promptVersion` trace quelle version de template a
 * été utilisée (R5 : changement de prompt = bump version = audit
 * trail clair des régressions potentielles).
 */
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
    actorId: varchar('actor_id', { length: 20 }),
    purpose: varchar('purpose', { length: 256 }).notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    model: varchar('model', { length: 128 }).notNull(),
    promptHash: varchar('prompt_hash', { length: 64 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 32 }).notNull().default('v1'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costEstimate: numeric('cost_estimate', { precision: 18, scale: 8 }).notNull().default('0'),
    success: boolean('success').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_guild_created').on(t.guildId, t.createdAt),
    index('idx_ai_actor_purpose_created').on(t.actorId, t.purpose, t.createdAt),
  ],
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

/**
 * Configuration globale de l'instance Varde — table singleton (une
 * seule ligne, contrainte applicative `id = 'singleton'` + CHECK).
 *
 * Stocke les credentials Discord (token bot, OAuth client secret)
 * chiffrés via le keystore (AES-256-GCM, master key en env), plus
 * l'identité du bot et l'avancement du wizard de setup.
 *
 * Les colonnes `*Ciphertext` / `*Iv` / `*AuthTag` portent les trois
 * pièces d'un blob AES-256-GCM. Toutes nullable tant que le wizard
 * n'a pas atteint l'étape concernée.
 */
export const instanceConfig = pgTable(
  'instance_config',
  {
    id: varchar('id', { length: 16 }).primaryKey().default('singleton'),
    discordAppId: varchar('discord_app_id', { length: 20 }),
    discordPublicKey: text('discord_public_key'),
    discordBotTokenCiphertext: bytea('discord_bot_token_ciphertext'),
    discordBotTokenIv: bytea('discord_bot_token_iv'),
    discordBotTokenAuthTag: bytea('discord_bot_token_auth_tag'),
    discordClientSecretCiphertext: bytea('discord_client_secret_ciphertext'),
    discordClientSecretIv: bytea('discord_client_secret_iv'),
    discordClientSecretAuthTag: bytea('discord_client_secret_auth_tag'),
    botName: text('bot_name'),
    botAvatarUrl: text('bot_avatar_url'),
    botDescription: text('bot_description'),
    baseUrl: text('base_url'),
    additionalUrls: jsonb('additional_urls')
      .$type<readonly { readonly id: string; readonly url: string; readonly label?: string }[]>()
      .notNull()
      .default([]),
    setupStep: integer('setup_step').notNull().default(1),
    setupCompletedAt: timestamp('setup_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('instance_config_singleton_check', sql`${t.id} = 'singleton'`)],
);

/**
 * Liste des owners de l'instance Varde — utilisateurs Discord
 * autorisés à accéder à `/admin/*` côté dashboard et `/api/admin/*`
 * côté API (jalon 7 PR 7.2).
 *
 * Le premier user qui se connecte après que `instance_config.
 * setup_completed_at` est posé devient automatiquement owner via
 * `claimFirstOwnership()` (le hook Auth.js fait l'appel). Les
 * suivants doivent être ajoutés explicitement par un owner
 * existant via `POST /api/admin/ownership`.
 *
 * Pas de FK vers une table `users` — l'instance n'enregistre pas
 * les utilisateurs Discord en local (ADR 0006). Le `discord_user_id`
 * est l'ID Discord brut (snowflake) tel que reçu via OAuth, et la
 * vérification d'identité reste la responsabilité d'Auth.js.
 */
export const instanceOwners = pgTable('instance_owners', {
  discordUserId: varchar('discord_user_id', { length: 20 }).primaryKey(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * `null` pour le premier owner (auto-assigné via
   * `claimFirstOwnership`). Sinon snowflake de l'owner qui a
   * accordé l'accès — utile pour l'audit ulterieur sans cross-FK.
   */
  grantedByDiscordUserId: varchar('granted_by_discord_user_id', { length: 20 }),
});

/**
 * Mappage rôle Discord → niveau de permission par guild (jalon 7
 * PR 7.3). Une ligne par guild. `admin_role_ids` non-vide invariant
 * (validé côté `guildPermissionsService`). `moderator_role_ids`
 * peut être vide. Listes JSONB pour évoluer sans migration de
 * schéma si on ajoute des niveaux additionnels.
 */
export const guildPermissions = pgTable('guild_permissions', {
  guildId: varchar('guild_id', { length: 20 })
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  adminRoleIds: jsonb('admin_role_ids').$type<readonly string[]>().notNull().default([]),
  moderatorRoleIds: jsonb('moderator_role_ids').$type<readonly string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Journal append-only des événements d'instance (rotation token,
 * ajout/retrait d'owner, changement d'URL…). Mirroir de `audit_log`
 * mais sans `guild_id` puisque ces événements sont scope-instance,
 * pas scope-guild.
 *
 * ID applicatif en ULID — aligné avec `audit_log` pour préserver
 * l'invariant pagination par cursor monotonic.
 */
export const instanceAuditLog = pgTable(
  'instance_audit_log',
  {
    id: varchar('id', { length: 26 }).primaryKey(),
    actorType: text('actor_type').$type<ActorType>().notNull(),
    actorId: varchar('actor_id', { length: 20 }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    severity: text('severity').$type<Severity>().notNull(),
    metadata: jsonb('metadata').$type<Readonly<Record<string, unknown>>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_instance_audit_action_created').on(t.action, t.createdAt),
    index('idx_instance_audit_actor').on(t.actorId),
  ],
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
  onboardingActionsLog,
  aiInvocations,
  keystore,
  instanceConfig,
  instanceOwners,
  instanceAuditLog,
  guildPermissions,
} as const;

export type PgSchema = typeof pgSchema;
