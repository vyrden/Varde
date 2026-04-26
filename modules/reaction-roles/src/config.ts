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

/**
 * Style visuel d'un bouton Discord en mode `kind: 'buttons'`. Mappe
 * 1-pour-1 sur l'enum `ButtonStyle` de discord.js (les valeurs
 * numériques restent un détail d'implémentation côté API).
 */
export const reactionRoleButtonStyleSchema = z.enum(['primary', 'secondary', 'success', 'danger']);
export type ReactionRoleButtonStyle = z.infer<typeof reactionRoleButtonStyleSchema>;

export const reactionRolePairSchema = z.object({
  emoji: reactionRoleEmojiSchema,
  roleId: z.string().regex(SNOWFLAKE, 'roleId doit être un snowflake Discord'),
  /**
   * Texte affiché sur le bouton en mode `kind: 'buttons'`. Limité à 80
   * caractères par Discord. Vide → on retombe sur le nom du rôle au
   * moment du rendu (résolu côté bot). Ignoré en mode `reactions`.
   */
  label: z.string().max(80).default(''),
  /**
   * Couleur du bouton en mode `kind: 'buttons'`. Ignoré en mode
   * `reactions`. Défaut `secondary` (gris) — ressort moins que les
   * boutons d'action (primary blue / success green).
   */
  style: reactionRoleButtonStyleSchema.default('secondary'),
});
export type ReactionRolePair = z.infer<typeof reactionRolePairSchema>;

export const reactionRoleModeSchema = z.enum(['normal', 'unique', 'verifier']);
export type ReactionRoleMode = z.infer<typeof reactionRoleModeSchema>;

/**
 * Type de retour visuel envoyé à l'utilisateur après attribution / retrait.
 * - `dm` : message privé du bot. Utilisable pour les deux kinds.
 * - `ephemeral` : réponse éphémère « Seul toi peux voir » — réservée
 *   au kind `buttons` (l'API ephemeral exige un contexte d'interaction
 *   et n'est pas disponible pour des réactions emoji).
 * - `none` : aucun feedback (silencieux).
 */
export const reactionRoleFeedbackSchema = z.enum(['dm', 'ephemeral', 'none']);
export type ReactionRoleFeedback = z.infer<typeof reactionRoleFeedbackSchema>;

/**
 * Type de support du reaction-role :
 * - `reactions` (défaut, V1) : réactions emoji sur le message.
 * - `buttons` (V2) : composants bouton Discord, débloque les réponses
 *   éphémères via les interactions.
 *
 * V1 n'avait pas ce champ — les entrées existantes en DB matchent le
 * default `reactions` au parse, sans migration nécessaire.
 */
export const reactionRoleKindSchema = z.enum(['reactions', 'buttons']).default('reactions');
export type ReactionRoleKind = z.infer<typeof reactionRoleKindSchema>;

export const reactionRoleMessageSchema = z
  .object({
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
    /** Support : réactions emoji (V1) ou boutons Discord (V2). */
    kind: reactionRoleKindSchema,
    mode: reactionRoleModeSchema,
    /**
     * Type de feedback. `ephemeral` n'est valide qu'en `kind: 'buttons'`
     * (cf. superRefine).
     */
    feedback: reactionRoleFeedbackSchema.default('dm'),
    pairs: z.array(reactionRolePairSchema).min(1).max(20),
  })
  .superRefine((msg, ctx) => {
    if (msg.feedback === 'ephemeral' && msg.kind !== 'buttons') {
      ctx.addIssue({
        code: 'custom',
        path: ['feedback'],
        message: "Le feedback 'ephemeral' n'est disponible qu'avec kind: 'buttons'",
      });
    }
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
