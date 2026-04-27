import type { OnboardingActionDefinition } from '@varde/contracts';
import { z } from 'zod';

/**
 * Actions custom contribuées par le module `welcome` au moteur
 * d'onboarding (ADR 0007). Permettent à un preset jalon 4 de câbler
 * le module : choix du salon de welcome/goodbye et auto-rôle, en
 * réutilisant les rôles/salons créés plus tôt dans la séquence
 * d'apply (`channelLocalId`, `roleLocalId`).
 *
 * Les patches de config passent par `ctx.configPatch` (deep merge),
 * donc seules les clés visées sont écrasées — le reste de la config
 * welcome reste intact.
 */

const SNOWFLAKE = /^\d{17,19}$/;

// ─── welcome.set-channel ───────────────────────────────────────────

const setChannelPayloadSchema = z
  .object({
    target: z.enum(['welcome', 'goodbye']),
    channelId: z.string().regex(SNOWFLAKE).optional(),
    channelLocalId: z.string().min(1).optional(),
    createChannel: z
      .object({
        name: z.string().min(1).max(100),
        topic: z.string().max(1024).optional(),
      })
      .optional(),
  })
  .refine(
    (p) =>
      p.channelId !== undefined || p.channelLocalId !== undefined || p.createChannel !== undefined,
    {
      message: 'channelId, channelLocalId ou createChannel requis',
    },
  );

export type SetWelcomeChannelPayload = z.infer<typeof setChannelPayloadSchema>;

export interface SetWelcomeChannelResult {
  readonly channelId: string;
  /** Présent uniquement si l'action a créé le salon — utilisé pour l'undo. */
  readonly createdChannelId: string | null;
}

export const setWelcomeChannelAction: OnboardingActionDefinition<
  SetWelcomeChannelPayload,
  SetWelcomeChannelResult
> = {
  type: 'welcome.set-channel',
  schema: setChannelPayloadSchema,
  canUndo: (result) => result.createdChannelId !== null,
  apply: async (ctx, payload) => {
    let channelId: string;
    let createdChannelId: string | null = null;

    if (payload.channelId !== undefined) {
      channelId = payload.channelId;
    } else if (payload.channelLocalId !== undefined) {
      const resolved = ctx.resolveLocalId(payload.channelLocalId);
      if (resolved === null) {
        throw new Error(
          `welcome.set-channel : channelLocalId '${payload.channelLocalId}' introuvable. ` +
            "L'action core.createChannel correspondante doit être appliquée plus tôt dans la séquence.",
        );
      }
      channelId = resolved;
    } else if (payload.createChannel !== undefined) {
      const created = await ctx.discord.createChannel({
        name: payload.createChannel.name,
        type: 'text',
        ...(payload.createChannel.topic !== undefined
          ? { topic: payload.createChannel.topic }
          : {}),
      });
      channelId = created.id;
      createdChannelId = created.id;
    } else {
      throw new Error('welcome.set-channel : payload invalide (vérifié par schema)');
    }

    await ctx.configPatch({
      modules: {
        welcome: {
          [payload.target]: {
            enabled: true,
            channelId,
          },
        },
      },
    });

    return { channelId, createdChannelId };
  },
  undo: async (ctx, _payload, previousResult) => {
    if (previousResult.createdChannelId !== null) {
      await ctx.discord.deleteChannel(previousResult.createdChannelId);
    }
  },
};

// ─── welcome.set-autorole ──────────────────────────────────────────

const setAutoroleePayloadSchema = z
  .object({
    roleId: z.string().regex(SNOWFLAKE).optional(),
    roleLocalId: z.string().min(1).optional(),
    createRole: z
      .object({
        name: z.string().min(1).max(100),
        color: z.number().int().min(0).max(0xffffff).optional(),
        mentionable: z.boolean().default(true),
      })
      .optional(),
    delaySeconds: z.number().int().min(0).max(86_400).default(0),
  })
  .refine(
    (p) => p.roleId !== undefined || p.roleLocalId !== undefined || p.createRole !== undefined,
    {
      message: 'roleId, roleLocalId ou createRole requis',
    },
  );

export type SetWelcomeAutoroleePayload = z.infer<typeof setAutoroleePayloadSchema>;

export interface SetWelcomeAutoroleResult {
  readonly roleId: string;
  /** Présent uniquement si l'action a créé le rôle — utilisé pour l'undo. */
  readonly createdRoleId: string | null;
}

export const setWelcomeAutoroleAction: OnboardingActionDefinition<
  SetWelcomeAutoroleePayload,
  SetWelcomeAutoroleResult
> = {
  type: 'welcome.set-autorole',
  schema: setAutoroleePayloadSchema,
  canUndo: (result) => result.createdRoleId !== null,
  apply: async (ctx, payload) => {
    let roleId: string;
    let createdRoleId: string | null = null;

    if (payload.roleId !== undefined) {
      roleId = payload.roleId;
    } else if (payload.roleLocalId !== undefined) {
      const resolved = ctx.resolveLocalId(payload.roleLocalId);
      if (resolved === null) {
        throw new Error(
          `welcome.set-autorole : roleLocalId '${payload.roleLocalId}' introuvable. ` +
            "L'action core.createRole correspondante doit être appliquée plus tôt.",
        );
      }
      roleId = resolved;
    } else if (payload.createRole !== undefined) {
      const created = await ctx.discord.createRole({
        name: payload.createRole.name,
        ...(payload.createRole.color !== undefined ? { color: payload.createRole.color } : {}),
        mentionable: payload.createRole.mentionable,
      });
      roleId = created.id;
      createdRoleId = created.id;
    } else {
      throw new Error('welcome.set-autorole : payload invalide (vérifié par schema)');
    }

    await ctx.configPatch({
      modules: {
        welcome: {
          autorole: {
            enabled: true,
            roleIds: [roleId],
            delaySeconds: payload.delaySeconds,
          },
        },
      },
    });

    return { roleId, createdRoleId };
  },
  undo: async (ctx, _payload, previousResult) => {
    if (previousResult.createdRoleId !== null) {
      await ctx.discord.deleteRole(previousResult.createdRoleId);
    }
  },
};
