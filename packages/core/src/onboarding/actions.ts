import type { OnboardingActionDefinition } from '@varde/contracts';
import { z } from 'zod';

/**
 * Actions core-owned du moteur d'onboarding (ADR 0007).
 *
 * V1 expose quatre primitives qui couvrent la surface du builder :
 * - `createRole` — crée un rôle Discord avec un preset de
 *   permissions (R1 : pas de bitfield exposé à l'admin).
 * - `createCategory` — crée une catégorie.
 * - `createChannel` — crée un salon texte / voice / forum, rattaché
 *   à une catégorie optionnelle.
 * - `patchModuleConfig` — écrit une patch dans `guild_config` via
 *   le ConfigService injecté dans le contexte.
 *
 * Chaque action a un `undo` idempotent. createRole / createCategory
 * / createChannel défont leur création en supprimant l'objet côté
 * Discord. patchModuleConfig est marquée `canUndo: false` côté V1 —
 * on ne sait pas reconstruire le patch inverse sans snapshot. Le
 * rollback d'une session qui inclut des patch de config remettra
 * les objets Discord en ordre mais ne restaurera pas la config
 * précédente ; documenté comme tel dans l'UI preview (PR 3.5).
 */

// ─── createRole ────────────────────────────────────────────────────

const permissionPresetIds = [
  'moderator-full',
  'moderator-minimal',
  'member-default',
  'member-restricted',
] as const;
export type PermissionPresetId = (typeof permissionPresetIds)[number];

/**
 * Bitfields Discord pour chaque preset. Les constantes viennent de
 * la spec `PermissionsBitField` (documentation discord.js v14). Le
 * mapping reste trivial — c'est justement l'idée : aucune bitfield
 * libre n'est exposée à l'admin, il choisit un preset, l'executor
 * le traduit.
 *
 * Références bits (discord.js PermissionFlagsBits) :
 * - ViewChannel            (1n << 10n)
 * - SendMessages           (1n << 11n)
 * - ManageMessages         (1n << 13n)
 * - ManageChannels         (1n << 4n)
 * - ManageRoles            (1n << 28n)
 * - ModerateMembers        (1n << 40n)
 * - BanMembers             (1n << 2n)
 * - KickMembers            (1n << 1n)
 * - ReadMessageHistory     (1n << 16n)
 * - Connect (voice)        (1n << 20n)
 * - Speak (voice)          (1n << 21n)
 *
 * Les presets sont validés par test snapshot dans
 * `tests/unit/onboarding-actions.test.ts`.
 */
const PERMISSION_PRESETS: Readonly<Record<PermissionPresetId, bigint>> = Object.freeze({
  // Full moderator : voit, écrit, gère messages / salons / rôles,
  // modère les membres (timeout), kick / ban.
  'moderator-full':
    (1n << 10n) |
    (1n << 11n) |
    (1n << 13n) |
    (1n << 4n) |
    (1n << 28n) |
    (1n << 40n) |
    (1n << 2n) |
    (1n << 1n) |
    (1n << 16n),
  // Minimal moderator : timeout + manage messages seulement.
  'moderator-minimal': (1n << 10n) | (1n << 11n) | (1n << 13n) | (1n << 40n) | (1n << 16n),
  // Default member : voit, écrit, lit historique, connecte voice, parle.
  'member-default': (1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 20n) | (1n << 21n),
  // Restricted member : voit, lit historique. Pas d'écriture, pas de voix.
  'member-restricted': (1n << 10n) | (1n << 16n),
});

export const PERMISSION_PRESET_BITS = PERMISSION_PRESETS;

const createRolePayloadSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.number().int().min(0).max(0xffffff).default(0),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
  permissionPreset: z.enum(permissionPresetIds).default('member-default'),
});
export type CreateRolePayload = z.infer<typeof createRolePayloadSchema>;
export interface CreateRoleResult {
  readonly id: string;
}

export const createRoleAction: OnboardingActionDefinition<CreateRolePayload, CreateRoleResult> = {
  type: 'core.createRole',
  schema: createRolePayloadSchema,
  canUndo: true,
  apply: async (ctx, payload) => {
    const bits = PERMISSION_PRESETS[payload.permissionPreset];
    const result = await ctx.discord.createRole({
      name: payload.name,
      color: payload.color,
      hoist: payload.hoist,
      mentionable: payload.mentionable,
      permissions: bits,
    });
    return { id: result.id };
  },
  undo: async (ctx, _payload, previousResult) => {
    await ctx.discord.deleteRole(previousResult.id);
  },
};

// ─── createCategory ────────────────────────────────────────────────

const createCategoryPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  position: z.number().int().min(0).default(0),
});
export type CreateCategoryPayload = z.infer<typeof createCategoryPayloadSchema>;
export interface CreateCategoryResult {
  readonly id: string;
}

export const createCategoryAction: OnboardingActionDefinition<
  CreateCategoryPayload,
  CreateCategoryResult
> = {
  type: 'core.createCategory',
  schema: createCategoryPayloadSchema,
  canUndo: true,
  apply: async (ctx, payload) => {
    const result = await ctx.discord.createCategory({
      name: payload.name,
      position: payload.position,
    });
    return { id: result.id };
  },
  undo: async (ctx, _payload, previousResult) => {
    await ctx.discord.deleteCategory(previousResult.id);
  },
};

// ─── createChannel ─────────────────────────────────────────────────

const channelTypes = ['text', 'voice', 'forum'] as const;

const createChannelPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(channelTypes).default('text'),
  parentId: z.string().min(1).optional(),
  topic: z.string().max(1024).optional(),
  slowmodeSeconds: z.number().int().min(0).max(21_600).default(0),
});
export type CreateChannelPayload = z.infer<typeof createChannelPayloadSchema>;
export interface CreateChannelResult {
  readonly id: string;
}

export const createChannelAction: OnboardingActionDefinition<
  CreateChannelPayload,
  CreateChannelResult
> = {
  type: 'core.createChannel',
  schema: createChannelPayloadSchema,
  canUndo: true,
  apply: async (ctx, payload) => {
    const result = await ctx.discord.createChannel({
      name: payload.name,
      type: payload.type,
      ...(payload.parentId !== undefined ? { parentId: payload.parentId } : {}),
      ...(payload.topic !== undefined ? { topic: payload.topic } : {}),
      slowmodeSeconds: payload.slowmodeSeconds,
    });
    return { id: result.id };
  },
  undo: async (ctx, _payload, previousResult) => {
    await ctx.discord.deleteChannel(previousResult.id);
  },
};

// ─── patchModuleConfig ─────────────────────────────────────────────

const patchModuleConfigPayloadSchema = z.object({
  moduleId: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type PatchModuleConfigPayload = z.infer<typeof patchModuleConfigPayloadSchema>;
export interface PatchModuleConfigResult {
  /** Reserved pour V2 (snapshot précédent à restaurer). Vide en V1. */
  readonly previous: Readonly<Record<string, unknown>> | null;
}

export const patchModuleConfigAction: OnboardingActionDefinition<
  PatchModuleConfigPayload,
  PatchModuleConfigResult
> = {
  type: 'core.patchModuleConfig',
  schema: patchModuleConfigPayloadSchema,
  canUndo: false,
  apply: async (ctx, payload) => {
    await ctx.configPatch({
      modules: { [payload.moduleId]: payload.config },
    });
    return { previous: null };
  },
  undo: async (_ctx, _payload, _previousResult) => {
    // canUndo=false : ce no-op n'est jamais appelé par l'executor
    // tant qu'on respecte le contrat. Présent pour satisfaire
    // l'obligation "undo est toujours défini" (R8).
  },
};

/**
 * Ensemble des actions core-owned à enregistrer au démarrage du
 * monolith `@varde/server`.
 */
export const CORE_ACTIONS = [
  createRoleAction,
  createCategoryAction,
  createChannelAction,
  patchModuleConfigAction,
] as const;
