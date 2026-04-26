import type {
  DiscordPermissionOverwrite,
  OnboardingActionContext,
  OnboardingActionDefinition,
} from '@varde/contracts';
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
  /**
   * Parent Discord direct (snowflake). Surface historique pour les
   * appels qui connaissent déjà l'id. Les appels venus du builder
   * passent plutôt par `parentLocalId` — résolu par l'executor via
   * `ctx.resolveLocalId`.
   */
  parentId: z.string().min(1).optional(),
  /** Ref locale vers une `core.createCategory` appliquée plus tôt. */
  parentLocalId: z.string().min(1).optional(),
  topic: z.string().max(1024).optional(),
  slowmodeSeconds: z.number().int().min(0).max(21_600).default(0),
  /**
   * Rôles (par `localId`) qui peuvent voir le salon. Vide =
   * visible par tout le monde. Traduit en overwrites Discord via
   * les bits `ViewChannel` / `Connect` selon le type du salon.
   */
  readableRoleLocalIds: z.array(z.string().min(1)).default([]),
  /**
   * Rôles (par `localId`) qui peuvent écrire / parler dans le salon.
   * Vide = autorisé à tout le monde. Implique aussi le droit de
   * voir : un rôle dans `writableRoleLocalIds` obtient à la fois
   * `ViewChannel` et le bit d'écriture approprié.
   */
  writableRoleLocalIds: z.array(z.string().min(1)).default([]),
});
export type CreateChannelPayload = z.infer<typeof createChannelPayloadSchema>;
export interface CreateChannelResult {
  readonly id: string;
}

// Bits Discord utilisés pour construire les overwrites. Références
// `PermissionFlagsBits` de discord.js v14.
const BIT_VIEW_CHANNEL = 1n << 10n;
const BIT_SEND_MESSAGES = 1n << 11n;
const BIT_CONNECT = 1n << 20n;
const BIT_SPEAK = 1n << 21n;

const readBitsFor = (type: (typeof channelTypes)[number]): bigint =>
  type === 'voice' ? BIT_VIEW_CHANNEL | BIT_CONNECT : BIT_VIEW_CHANNEL;

const writeBitsFor = (type: (typeof channelTypes)[number]): bigint =>
  type === 'voice' ? BIT_SPEAK : BIT_SEND_MESSAGES;

/**
 * Construit les `permissionOverwrites` Discord à partir des listes
 * `readableRoleLocalIds` / `writableRoleLocalIds` et du type du
 * salon. Sémantique :
 *
 * - Un rôle dans `writable` reçoit `allow = read | write`, ce qui
 *   évite le piège d'un rôle autorisé à écrire mais pas à voir.
 * - Un rôle dans `read` seul reçoit `allow = read`.
 * - Si au moins une whitelist est non-vide, on refuse les bits
 *   correspondants à `@everyone` (le guild id sert d'id de rôle
 *   @everyone côté API Discord).
 *
 * Les refs non résolues (rôle qui n'a pas encore été appliqué dans
 * la séquence) sont silencieusement ignorées — la validation
 * préalable côté draft garantit qu'elles existent, mais un
 * executor idempotent doit rester tolérant.
 */
const buildOverwrites = (
  guildId: string,
  resolveLocalId: (localId: string) => string | null,
  type: (typeof channelTypes)[number],
  readable: readonly string[],
  writable: readonly string[],
): readonly DiscordPermissionOverwrite[] => {
  const readBits = readBitsFor(type);
  const writeBits = writeBitsFor(type);
  const perRoleAllow = new Map<string, bigint>();

  for (const localId of readable) {
    const roleId = resolveLocalId(localId);
    if (!roleId) continue;
    perRoleAllow.set(roleId, (perRoleAllow.get(roleId) ?? 0n) | readBits);
  }
  for (const localId of writable) {
    const roleId = resolveLocalId(localId);
    if (!roleId) continue;
    perRoleAllow.set(roleId, (perRoleAllow.get(roleId) ?? 0n) | readBits | writeBits);
  }

  let everyoneDeny = 0n;
  if (readable.length > 0) everyoneDeny |= readBits;
  if (writable.length > 0 && readable.length === 0) everyoneDeny |= writeBits;

  const overwrites: DiscordPermissionOverwrite[] = [];
  if (everyoneDeny !== 0n) {
    overwrites.push({ roleId: guildId, deny: everyoneDeny });
  }
  for (const [roleId, allow] of perRoleAllow) {
    overwrites.push({ roleId, allow });
  }
  return overwrites;
};

export const createChannelAction: OnboardingActionDefinition<
  CreateChannelPayload,
  CreateChannelResult
> = {
  type: 'core.createChannel',
  schema: createChannelPayloadSchema,
  canUndo: true,
  apply: async (ctx, payload) => {
    const resolvedParentId =
      payload.parentId ??
      (payload.parentLocalId
        ? (ctx.resolveLocalId(payload.parentLocalId) ?? undefined)
        : undefined);

    const overwrites = buildOverwrites(
      ctx.guildId,
      ctx.resolveLocalId,
      payload.type,
      payload.readableRoleLocalIds,
      payload.writableRoleLocalIds,
    );

    const result = await ctx.discord.createChannel({
      name: payload.name,
      type: payload.type,
      ...(resolvedParentId !== undefined ? { parentId: resolvedParentId } : {}),
      ...(payload.topic !== undefined ? { topic: payload.topic } : {}),
      slowmodeSeconds: payload.slowmodeSeconds,
      ...(overwrites.length > 0 ? { permissionOverwrites: overwrites } : {}),
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

/**
 * Pattern d'un placeholder de référence à un `localId` créé en amont
 * dans la séquence d'actions onboarding. Le préfixe (`role`,
 * `channel`, `category`, `user`) est purement informatif côté
 * lecteur — `ctx.resolveLocalId` n'a pas de notion de kind, le
 * mapping `localId → snowflake` est plat.
 *
 * Exemples valides :
 *   `@role:role-mod`
 *   `@channel:chan-logs`
 *   `@category:cat-info`
 *
 * Toute string config qui ne matche pas est laissée intacte.
 */
const REF_PATTERN = /^@(role|channel|category|user):(.+)$/;

/**
 * Walk récursif sur la config du module : remplace toute string
 * `'@<kind>:<localId>'` par le snowflake résolu via
 * `ctx.resolveLocalId`. Préserve les structures (arrays, objets
 * imbriqués, primitives non-string).
 *
 * Si une référence ne résout pas (création en amont absente ou
 * orpheline), jette une `Error` explicite — l'executor rollback la
 * séquence onboarding au lieu de persister un placeholder cassé.
 */
const resolveConfigRefs = (value: unknown, ctx: OnboardingActionContext, path: string): unknown => {
  if (typeof value === 'string') {
    const match = REF_PATTERN.exec(value);
    if (match) {
      const localId = match[2] as string;
      const resolved = ctx.resolveLocalId(localId);
      if (resolved === null) {
        throw new Error(
          `core.patchModuleConfig : localId "${localId}" référencé en "${path}" non résolu (action upstream manquante ou orpheline)`,
        );
      }
      return resolved;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => resolveConfigRefs(v, ctx, `${path}[${i}]`));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveConfigRefs(v, ctx, path === '' ? k : `${path}.${k}`);
    }
    return out;
  }
  return value;
};

export const patchModuleConfigAction: OnboardingActionDefinition<
  PatchModuleConfigPayload,
  PatchModuleConfigResult
> = {
  type: 'core.patchModuleConfig',
  schema: patchModuleConfigPayloadSchema,
  canUndo: false,
  apply: async (ctx, payload) => {
    const resolved = resolveConfigRefs(payload.config, ctx, '') as Readonly<
      Record<string, unknown>
    >;
    await ctx.configPatch({
      modules: { [payload.moduleId]: resolved },
    });
    return { previous: null };
  },
  undo: async (_ctx, _payload, _previousResult) => {
    // canUndo=false : ce no-op n'est jamais appelé par l'executor
    // tant qu'on respecte le contrat. Présent pour satisfaire
    // l'obligation "undo est toujours défini" (R8).
  },
};

// ─── bindPermission ────────────────────────────────────────────────

const bindPermissionPayloadSchema = z.object({
  permissionId: z.string().min(1),
  roleLocalId: z.string().min(1),
});
export type BindPermissionPayload = z.infer<typeof bindPermissionPayloadSchema>;
export interface BindPermissionResult {
  /** Snowflake Discord du rôle lié, capturé à l'apply pour l'undo. */
  readonly roleId: string;
}

/**
 * Lie une permission applicative à un rôle Discord. `apply` résout le
 * `roleLocalId` via `ctx.resolveLocalId` (rôle créé plus tôt dans la
 * séquence d'onboarding par un `core.createRole`), puis appelle
 * `ctx.permissions.bind` qui écrit dans `permission_bindings`.
 *
 * Idempotence : `permissions.bind` est idempotent côté core (insert
 * ignoré si la ligne existe déjà — cf. service). `undo` supprime
 * uniquement la ligne `(guildId, permissionId, roleId)` exacte, ce
 * qui n'interfère pas avec un binding posé à la main par l'admin
 * entre l'apply et le rollback (ADR 0008 § invariant).
 */
export const bindPermissionAction: OnboardingActionDefinition<
  BindPermissionPayload,
  BindPermissionResult
> = {
  type: 'core.bindPermission',
  schema: bindPermissionPayloadSchema,
  canUndo: true,
  apply: async (ctx, payload) => {
    const roleId = ctx.resolveLocalId(payload.roleLocalId);
    if (roleId === null) {
      throw new Error(
        `core.bindPermission : roleLocalId "${payload.roleLocalId}" non résolu (action createRole manquante ou orpheline)`,
      );
    }
    await ctx.permissions.bind(payload.permissionId, roleId);
    return { roleId };
  },
  undo: async (ctx, payload, previousResult) => {
    await ctx.permissions.unbind(payload.permissionId, previousResult.roleId);
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
  bindPermissionAction,
] as const;
