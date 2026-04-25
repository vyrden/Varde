import type { ConfigUi } from '@varde/contracts';
import { z } from 'zod';

/**
 * Schéma de la config de `reaction-roles` stockée sous
 * `guild_config.reaction-roles`.
 *
 * Invariants (vérifiés via superRefine) :
 * - Un même emoji ne peut pas apparaître deux fois dans les paires d'un
 *   même message (sinon les deux règles se marcheraient dessus à l'exécution).
 *
 * La structure est plate (pas de `modules` wrapper) : la section est
 * extrait directement depuis la clé `reaction-roles` du snapshot.
 */

const SNOWFLAKE = /^\d{17,19}$/;

export const reactionRoleEmojiSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unicode'), value: z.string().min(1) }),
  z.object({
    type: z.literal('custom'),
    id: z.string().regex(SNOWFLAKE),
    name: z.string().min(1),
    animated: z.boolean().default(false),
  }),
]);
export type ReactionRoleEmoji = z.infer<typeof reactionRoleEmojiSchema>;

export const reactionRolePairSchema = z.object({
  emoji: reactionRoleEmojiSchema,
  roleId: z.string().regex(SNOWFLAKE, 'roleId doit être un snowflake Discord'),
});
export type ReactionRolePair = z.infer<typeof reactionRolePairSchema>;

export const reactionRoleModeSchema = z.enum(['normal', 'unique', 'verifier']);
export type ReactionRoleMode = z.infer<typeof reactionRoleModeSchema>;

/**
 * Type de retour visuel envoyé à l'utilisateur après attribution / retrait.
 * - `dm` : message privé du bot (vrai message « visible que par lui »).
 * - `none` : aucun feedback (silencieux).
 *
 * Note : Discord ne permet pas les messages éphémères en réponse à une
 * réaction (l'API ephemeral exige un contexte d'interaction). Si on
 * voulait du « Seul toi peux voir » il faudrait passer ce module sur des
 * boutons Discord à la place des réactions.
 */
export const reactionRoleFeedbackSchema = z.enum(['dm', 'none']);
export type ReactionRoleFeedback = z.infer<typeof reactionRoleFeedbackSchema>;

export const reactionRoleMessageSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(64),
  channelId: z.string().regex(SNOWFLAKE),
  messageId: z.string().regex(SNOWFLAKE),
  /**
   * Contenu textuel du message Discord, miroir de l'état de Discord
   * pour permettre l'édition depuis le dashboard sans aller-retour.
   * Vide par défaut pour les entrées créées avant l'introduction du
   * champ : l'admin saisit le nouveau texte au moment de l'édition.
   */
  message: z.string().max(2000).default(''),
  mode: reactionRoleModeSchema,
  /** Type de feedback envoyé à l'utilisateur après une réaction. */
  feedback: reactionRoleFeedbackSchema.default('dm'),
  pairs: z.array(reactionRolePairSchema).min(1).max(20),
});
export type ReactionRoleMessage = z.infer<typeof reactionRoleMessageSchema>;

export const reactionRolesConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    messages: z.array(reactionRoleMessageSchema).default([]),
  })
  .superRefine((cfg, ctx) => {
    for (const [i, msg] of cfg.messages.entries()) {
      const seen = new Set<string>();
      for (const [j, pair] of msg.pairs.entries()) {
        const key = pair.emoji.type === 'unicode' ? `u:${pair.emoji.value}` : `c:${pair.emoji.id}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['messages', i, 'pairs', j, 'emoji'],
            message: `emoji duppliqué dans le reaction-role ${msg.label}`,
          });
        }
        seen.add(key);
      }
    }
  });

export type ReactionRolesConfig = z.infer<typeof reactionRolesConfigSchema>;

/** Alias normalisé utilisé par `defineModule` et les exports publics. */
export const configSchema = reactionRolesConfigSchema;

/**
 * Métadonnées de rendu dashboard. La configuration reaction-roles est
 * éditée via une page dédiée, pas via le ConfigForm générique — pas de
 * champ scalaire simple à rendre ici.
 */
export const configUi: ConfigUi = {
  fields: [],
};

const MODULE_ID = 'reaction-roles';

/**
 * Extrait la section `reaction-roles` d'un snapshot guild_config
 * et la valide via le schéma. Retourne la config par défaut si absente.
 *
 * Le snapshot a la forme `{ core: ..., modules: { 'reaction-roles': ... } }`.
 * Il faut donc lire `modules['reaction-roles']`, pas le top-level.
 */
export function resolveConfig(raw: unknown): ReactionRolesConfig {
  const asObj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  // biome-ignore lint/complexity/useLiteralKeys: noUncheckedIndexedAccess requires bracket notation for index signatures
  const modules = asObj['modules'];
  const moduleConfig =
    modules !== undefined && modules !== null && typeof modules === 'object'
      ? (modules as Record<string, unknown>)[MODULE_ID]
      : undefined;
  return reactionRolesConfigSchema.parse(moduleConfig ?? {});
}
