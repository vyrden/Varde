import type { ActionId, GuildId, ModuleId, PermissionId, RoleId, UserId } from './ids.js';
import type { Ulid } from './ulid.js';

/**
 * Shapes des enregistrements DB exposés par `@varde/db`. Sert de
 * contrat entre la couche DB et ses consommateurs (core, modules,
 * API). Toute évolution doit rester synchronisée avec le schéma
 * Drizzle de `@varde/db`.
 */

/** Timestamp ISO-8601 sérialisé en string (UTC). */
export type Iso8601DateTime = string & { readonly __dateString: true };

/** Registre des serveurs Discord où le bot est actif. */
export interface GuildRecord {
  readonly id: GuildId;
  readonly name: string;
  readonly joinedAt: Iso8601DateTime;
  readonly leftAt: Iso8601DateTime | null;
  readonly locale: string;
  readonly createdAt: Iso8601DateTime;
  readonly updatedAt: Iso8601DateTime;
}

/** Configuration agrégée d'un serveur (JSON hiérarchique). */
export interface GuildConfigRecord {
  readonly guildId: GuildId;
  readonly config: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly updatedAt: Iso8601DateTime;
  readonly updatedBy: UserId | null;
}

/** Registre global des modules installés sur l'instance. */
export interface ModuleRegistryRecord {
  readonly id: ModuleId;
  readonly version: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly schemaVersion: number;
  readonly loadedAt: Iso8601DateTime;
}

/** Activation d'un module pour un serveur donné. */
export interface GuildModuleRecord {
  readonly guildId: GuildId;
  readonly moduleId: ModuleId;
  readonly enabled: boolean;
  readonly enabledAt: Iso8601DateTime | null;
  readonly enabledBy: UserId | null;
  readonly disabledAt: Iso8601DateTime | null;
}

/** Niveau par défaut d'une permission (également typé côté Zod dans manifest.ts). */
export type PermissionDefaultLevelValue = 'admin' | 'moderator' | 'member' | 'nobody';

/** Registre global des permissions déclarées par les modules. */
export interface PermissionRegistryRecord {
  readonly id: PermissionId;
  readonly moduleId: ModuleId;
  readonly description: string;
  readonly category: string;
  readonly defaultLevel: PermissionDefaultLevelValue;
  readonly createdAt: Iso8601DateTime;
}

/** Liaison permission ↔ rôle Discord par serveur. */
export interface PermissionBindingRecord {
  readonly guildId: GuildId;
  readonly permissionId: PermissionId;
  readonly roleId: RoleId;
  readonly grantedBy: UserId | null;
  readonly createdAt: Iso8601DateTime;
}

/** Type d'acteur dans une entrée d'audit. */
export type AuditActorType = 'user' | 'system' | 'module';

/** Niveau de gravité enregistré dans l'audit log. */
export type AuditSeverityLevel = 'info' | 'warn' | 'error';

/** Entrée du journal d'audit unifié, append-only. */
export interface AuditLogRecord {
  readonly id: Ulid;
  readonly guildId: GuildId;
  readonly actorType: AuditActorType;
  readonly actorId: string | null;
  readonly action: ActionId;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly moduleId: ModuleId | null;
  readonly severity: AuditSeverityLevel;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Iso8601DateTime;
}

/** Type de tâche planifiée. */
export type ScheduledTaskKind = 'one_shot' | 'recurring';

/** Statut d'exécution d'une tâche planifiée. */
export type ScheduledTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Projection DB d'une tâche planifiée (exécuteur : BullMQ ou fallback). */
export interface ScheduledTaskRecord {
  readonly id: Ulid;
  readonly jobKey: string;
  readonly moduleId: ModuleId;
  readonly guildId: GuildId | null;
  readonly kind: ScheduledTaskKind;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly runAt: Iso8601DateTime;
  readonly status: ScheduledTaskStatus;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAt: Iso8601DateTime;
  readonly updatedAt: Iso8601DateTime;
}

/** Statut d'une session d'onboarding. */
export type OnboardingSessionStatus = 'in_progress' | 'completed' | 'aborted' | 'rolled_back';

/** Mode d'onboarding : serveur neuf, existant, rejeu. */
export type OnboardingSessionMode = 'fresh' | 'existing' | 'replay';

/** Session d'onboarding en cours ou terminée. */
export interface OnboardingSessionRecord {
  readonly id: Ulid;
  readonly guildId: GuildId;
  readonly startedBy: UserId;
  readonly status: OnboardingSessionStatus;
  readonly mode: OnboardingSessionMode;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly plan: Readonly<Record<string, unknown>> | null;
  readonly appliedActions: readonly Readonly<Record<string, unknown>>[];
  readonly startedAt: Iso8601DateTime;
  readonly completedAt: Iso8601DateTime | null;
  readonly expiresAt: Iso8601DateTime;
}

/** Trace d'une invocation IA (prompt brut non stocké, hash uniquement). */
export interface AIInvocationRecord {
  readonly id: Ulid;
  readonly guildId: GuildId;
  readonly moduleId: ModuleId | null;
  readonly purpose: string;
  readonly provider: string;
  readonly model: string;
  readonly promptHash: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costEstimate: number;
  readonly success: boolean;
  readonly error: string | null;
  readonly createdAt: Iso8601DateTime;
}

/** Secret tiers chiffré dans le keystore (AES-256-GCM). */
export interface KeystoreRecord {
  readonly guildId: GuildId;
  readonly moduleId: ModuleId;
  readonly key: string;
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly createdAt: Iso8601DateTime;
  readonly updatedAt: Iso8601DateTime;
}
