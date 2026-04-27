import { z } from 'zod';

import type { GuildId, ModuleId, UserId } from './ids.js';
import type { Ulid } from './ulid.js';

/**
 * Contrats du moteur d'onboarding (ADR 0007).
 *
 * Surface publique partagée par :
 * - `@varde/core` (executor, registre d'actions)
 * - `@varde/api` (routes builder)
 * - les modules tiers qui contribuent des actions custom via
 *   `ctx.onboarding.registerAction(def)` (V1 : uniquement le module
 *   témoin `onboarding-test`).
 *
 * Les shapes DB miroir sont dans `db-records.ts`. Ce fichier expose
 * le contrat runtime (definitions d'actions, results, draft).
 */

// ─── Draft builder ─────────────────────────────────────────────────

const permissionPresetIds = [
  'moderator-full',
  'moderator-minimal',
  'member-default',
  'member-restricted',
] as const;
export type PermissionPresetId = (typeof permissionPresetIds)[number];

const channelTypes = ['text', 'voice', 'forum'] as const;
export type DraftChannelType = (typeof channelTypes)[number];

/** Rôle à créer, tel que défini dans le draft du builder. */
export const draftRoleSchema = z.object({
  localId: z.string().min(1),
  nameFr: z.string().min(1).max(100).optional(),
  nameEn: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100),
  color: z.number().int().min(0).max(0xffffff).default(0),
  permissionPreset: z.enum(permissionPresetIds).default('member-default'),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
});
export type DraftRole = z.infer<typeof draftRoleSchema>;

/** Catégorie du draft, parente d'un groupe de salons. */
export const draftCategorySchema = z.object({
  localId: z.string().min(1),
  name: z.string().min(1).max(100),
  position: z.number().int().min(0).default(0),
});
export type DraftCategory = z.infer<typeof draftCategorySchema>;

/** Salon du draft, appartient optionnellement à une catégorie. */
export const draftChannelSchema = z.object({
  localId: z.string().min(1),
  categoryLocalId: z.string().min(1).nullable(),
  name: z.string().min(1).max(100),
  type: z.enum(channelTypes).default('text'),
  topic: z.string().max(1024).optional(),
  slowmodeSeconds: z.number().int().min(0).max(21_600).default(0),
  readableBy: z
    .array(z.string().min(1))
    .default([])
    .describe('localIds de rôles autorisés à lire ; vide = tout le monde'),
  writableBy: z
    .array(z.string().min(1))
    .default([])
    .describe('localIds de rôles autorisés à écrire ; vide = tout le monde'),
});
export type DraftChannel = z.infer<typeof draftChannelSchema>;

/** Config à appliquer sur un module après création des salons/rôles. */
export const draftModuleConfigSchema = z.object({
  moduleId: z.string().min(1),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type DraftModuleConfig = z.infer<typeof draftModuleConfigSchema>;

/**
 * Binding initial d'une permission applicative vers un rôle local.
 * Forme parallèle à `PresetPermissionBinding` mais vit dans les
 * contracts pour que le dashboard et l'executor partagent le même
 * vocabulaire. La résolution du `roleLocalId` vers le snowflake
 * Discord se fait à l'apply via `ctx.resolveLocalId`, comme pour
 * les overwrites de salons.
 */
export const draftPermissionBindingSchema = z.object({
  permissionId: z.string().min(1),
  roleLocalId: z.string().min(1),
});
export type DraftPermissionBinding = z.infer<typeof draftPermissionBindingSchema>;

/**
 * État interne d'une session onboarding côté builder. Ce qu'un
 * preset produit, ce qu'un patch modifie, ce qu'un preview
 * transforme en liste d'actions.
 */
export const onboardingDraftSchema = z.object({
  locale: z.enum(['fr', 'en']).default('fr'),
  roles: z.array(draftRoleSchema).default([]),
  categories: z.array(draftCategorySchema).default([]),
  channels: z.array(draftChannelSchema).default([]),
  modules: z.array(draftModuleConfigSchema).default([]),
  permissionBindings: z.array(draftPermissionBindingSchema).default([]),
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

// ─── Actions : contrat d'extension ────────────────────────────────

/**
 * Contexte fourni aux actions pendant leur `apply` / `undo`. Le core
 * concret l'implémentera dans `@varde/core` — ce contrat garantit que
 * les modules tiers voient la même surface.
 */
export interface OnboardingActionContext {
  readonly guildId: GuildId;
  readonly actorId: UserId;
  readonly logger: {
    readonly info: (message: string, meta?: Record<string, unknown>) => void;
    readonly warn: (message: string, meta?: Record<string, unknown>) => void;
    readonly error: (message: string, error?: Error, meta?: Record<string, unknown>) => void;
  };
  /**
   * Accès sélectif aux services Discord (création rôle / salon /
   * catégorie, patch permissions). L'implémentation concrète passe
   * par `@varde/bot` / discord.js.
   */
  readonly discord: {
    readonly createRole: (payload: DiscordCreateRolePayload) => Promise<DiscordCreateResult>;
    readonly deleteRole: (roleId: string) => Promise<void>;
    readonly createCategory: (
      payload: DiscordCreateCategoryPayload,
    ) => Promise<DiscordCreateResult>;
    readonly deleteCategory: (channelId: string) => Promise<void>;
    readonly createChannel: (payload: DiscordCreateChannelPayload) => Promise<DiscordCreateResult>;
    readonly deleteChannel: (channelId: string) => Promise<void>;
  };
  /** Raccourci vers le ConfigService pour `patchModuleConfig`. */
  readonly configPatch: (patch: Readonly<Record<string, unknown>>) => Promise<void>;
  /**
   * Résout une référence locale (`localId` défini dans le draft) vers
   * l'`externalId` Discord produit par l'action correspondante plus
   * tôt dans la séquence d'apply. Renvoie `null` si la ref est
   * inconnue (action pas encore appliquée, ou ref orpheline).
   *
   * Utilisé en V1 par `core.createChannel` pour pointer un
   * `parentLocalId` vers la catégorie réelle et pour construire
   * les `permissionOverwrites` à partir des `roleLocalId`.
   */
  readonly resolveLocalId: (localId: string) => string | null;
  /**
   * Gestion programmatique des bindings `permission → rôle`. Utilisé
   * par l'action `core.bindPermission`. `bind` est idempotent
   * (insert-if-not-exists). `unbind` supprime uniquement la ligne
   * exacte `(guildId, permissionId, roleId)` — pas d'effet de bord
   * sur d'autres bindings de la même permission.
   */
  readonly permissions: {
    readonly bind: (permissionId: string, roleId: string) => Promise<void>;
    readonly unbind: (permissionId: string, roleId: string) => Promise<void>;
  };
}

export interface DiscordCreateRolePayload {
  readonly name: string;
  readonly color?: number;
  readonly hoist?: boolean;
  readonly mentionable?: boolean;
  readonly permissions?: bigint;
}
export interface DiscordCreateCategoryPayload {
  readonly name: string;
  readonly position?: number;
}
export interface DiscordCreateChannelPayload {
  readonly name: string;
  readonly type: DraftChannelType;
  readonly parentId?: string;
  readonly topic?: string;
  readonly slowmodeSeconds?: number;
  readonly permissionOverwrites?: readonly DiscordPermissionOverwrite[];
}
export interface DiscordPermissionOverwrite {
  readonly roleId: string;
  readonly allow?: bigint;
  readonly deny?: bigint;
}
/** Retour d'une action qui crée un objet Discord. `id` = snowflake. */
export interface DiscordCreateResult {
  readonly id: string;
}

/**
 * Définition d'une action composable. Chaque implémentation est
 * idempotente, possède un `undo` (même trivial), et déclare sa
 * capacité à être défaite (R8).
 */
export interface OnboardingActionDefinition<Payload, Result> {
  readonly type: string;
  readonly schema: z.ZodType<Payload>;
  readonly apply: (ctx: OnboardingActionContext, payload: Payload) => Promise<Result>;
  readonly undo: (
    ctx: OnboardingActionContext,
    payload: Payload,
    previousResult: Result,
  ) => Promise<void>;
  readonly canUndo: boolean | ((result: Result) => boolean);
}

/**
 * Action `core.bindPermission` : associe une permission applicative
 * à un rôle Discord résolu à partir du draft.
 *
 * Pas de `localId` propre : un binding n'est pas référencé par
 * d'autres actions, donc il n'a pas besoin d'être nommé dans la
 * map de résolution locale.
 */
const bindPermissionRequestSchema = z.object({
  type: z.literal('core.bindPermission'),
  payload: z.object({
    permissionId: z.string().min(1),
    roleLocalId: z.string().min(1),
  }),
});

/**
 * Schéma de validation d'une paire `(type, payload)` attendue par
 * l'executor. Chaque variant est discriminé sur `type`.
 */
export const onboardingActionRequestSchema = z.discriminatedUnion('type', [
  bindPermissionRequestSchema,
]);
export type OnboardingActionRequestParsed = z.infer<typeof onboardingActionRequestSchema>;

/** Paire (type, payload) attendue par l'executor pour une action. */
export interface OnboardingActionRequest {
  readonly type: string;
  readonly payload: unknown;
  /**
   * Référence locale stable attribuée par le builder (ex. `role-mod`,
   * `cat-general`). Quand l'action produit un `externalId` Discord,
   * l'executor associe `localId ↔ externalId` dans sa map pour que
   * les actions suivantes puissent résoudre cette ref via
   * `ctx.resolveLocalId`. Facultatif : une action qui ne référence
   * rien et qui n'est référencée par rien peut l'omettre.
   */
  readonly localId?: string;
}

// ─── Re-exports pour ergonomie ────────────────────────────────────

export type {
  OnboardingActionStatus,
  OnboardingPresetSource,
  OnboardingSessionStatus,
} from './db-records.js';

// Ré-expose les ids dérivés (le core construit un `SessionId`
// opaque à partir d'un `Ulid`).
export type OnboardingSessionId = Ulid & { readonly __onboardingSessionId: true };
export type OnboardingActionLogId = Ulid & { readonly __onboardingActionLogId: true };

/** Une référence légère vers un module qui contribue une action. */
export interface ActionContributor {
  readonly moduleId: ModuleId;
  readonly version: string;
}
