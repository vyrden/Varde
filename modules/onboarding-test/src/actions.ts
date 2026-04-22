import type { OnboardingActionDefinition } from '@varde/contracts';
import { z } from 'zod';

/**
 * Action custom contribuée par le module `onboarding-test` (PR 3.13).
 *
 * Rôle : démontrer qu'un module tiers peut ajouter une primitive au
 * moteur d'onboarding. L'action crée un salon texte dédié aux
 * commandes de jeu, puis patche la config du module avec l'id
 * Discord du salon ainsi obtenu. Le `undo` supprime le salon ;
 * l'inversion du patch config est explicitement hors périmètre V1
 * (même contrainte que `core.patchModuleConfig`, cf. ADR 0007).
 *
 * Séquencement : l'action est exécutée dans l'ordre où elle apparaît
 * dans la liste d'actions passée à l'executor. Un draft la place
 * typiquement après les `core.createChannel` standard.
 */

export const setupGamingCommandsPayloadSchema = z.object({
  channelName: z.string().min(1).max(100).default('gaming-commands'),
  topic: z.string().max(1024).optional().describe('Sujet affiché dans le header du salon.'),
});
export type SetupGamingCommandsPayload = z.infer<typeof setupGamingCommandsPayloadSchema>;

export interface SetupGamingCommandsResult {
  /** Snowflake du salon créé. Sert aussi d'`externalId` pour l'undo. */
  readonly id: string;
}

export const setupGamingCommandsAction: OnboardingActionDefinition<
  SetupGamingCommandsPayload,
  SetupGamingCommandsResult
> = {
  type: 'onboarding-test.setup-gaming-commands',
  schema: setupGamingCommandsPayloadSchema,
  canUndo: true,
  apply: async (ctx, payload) => {
    const channel = await ctx.discord.createChannel({
      name: payload.channelName,
      type: 'text',
      slowmodeSeconds: 0,
      ...(payload.topic !== undefined ? { topic: payload.topic } : {}),
    });
    await ctx.configPatch({
      modules: {
        'onboarding-test': {
          gamingChannelId: channel.id,
          gamingChannelName: payload.channelName,
        },
      },
    });
    return { id: channel.id };
  },
  undo: async (ctx, _payload, previousResult) => {
    await ctx.discord.deleteChannel(previousResult.id);
  },
};
