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
 * Style visuel d'un bouton Discord. Mappe 1-pour-1 sur l'enum
 * `ButtonStyle` de discord.js (les valeurs numériques restent un
 * détail d'implémentation côté API).
 */
export const reactionRoleButtonStyleSchema = z.enum(['primary', 'secondary', 'success', 'danger']);
export type ReactionRoleButtonStyle = z.infer<typeof reactionRoleButtonStyleSchema>;

/**
 * Type de support d'une paire (emoji, rôle) :
 * - `reaction` : Discord ajoute une réaction emoji au message ; les
 *   membres réagissent pour toggler le rôle.
 * - `button` : Discord pose un bouton interactif ; les membres cliquent
 *   et le bot peut répondre éphémère.
 *
 * Le `kind` est posé **par paire**, pas par message — un même message
 * peut donc mélanger des réactions et des boutons.
 */
export const reactionRolePairKindSchema = z.enum(['reaction', 'button']).default('reaction');
export type ReactionRolePairKind = z.infer<typeof reactionRolePairKindSchema>;

export const reactionRolePairSchema = z.object({
  /** Type de l'élément. Défaut `reaction` pour rétro-compat. */
  kind: reactionRolePairKindSchema,
  emoji: reactionRoleEmojiSchema,
  roleId: z.string().regex(SNOWFLAKE, 'roleId doit être un snowflake Discord'),
  /**
   * Texte affiché sur le bouton (kind=button uniquement). Limité à 80
   * caractères par Discord. Vide → on retombe sur le nom du rôle au
   * moment du rendu (résolu côté bot). Ignoré en kind=reaction.
   */
  label: z.string().max(80).default(''),
  /**
   * Couleur du bouton (kind=button uniquement). Ignoré en kind=reaction.
   * Défaut `secondary` (gris) — ressort moins que les boutons d'action
   * (primary blue / success green).
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
 *   aux paires `kind: 'button'` (l'API ephemeral exige un contexte
 *   d'interaction et n'est pas disponible pour des réactions emoji).
 *   Pour une paire `kind: 'reaction'`, on retombe sur `dm`.
 * - `none` : aucun feedback (silencieux).
 */
export const reactionRoleFeedbackSchema = z.enum(['dm', 'ephemeral', 'none']);
export type ReactionRoleFeedback = z.infer<typeof reactionRoleFeedbackSchema>;

/**
 * Pré-traite un objet `message` brut (lu de la DB) avant validation
 * Zod pour migrer le champ `kind` historiquement posé au niveau
 * **message** (V2 initial) vers son emplacement définitif au niveau
 * **paire**. Idempotent : un objet déjà au nouveau format passe
 * inchangé.
 *
 * - `kind: 'buttons'` au niveau message → toutes les paires sans
 *   `kind` deviennent `kind: 'button'`.
 * - `kind: 'reactions'` (ou absent) → toutes les paires sans `kind`
 *   deviennent `kind: 'reaction'`.
 *
 * Une fois la migration appliquée le champ message-level est retiré.
 */
const migrateMessageKind = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  const messageKind = obj['kind'];
  const fallbackPairKind: ReactionRolePairKind = messageKind === 'buttons' ? 'button' : 'reaction';
  if (Array.isArray(obj['pairs'])) {
    obj['pairs'] = (obj['pairs'] as unknown[]).map((p) => {
      if (typeof p !== 'object' || p === null) return p;
      const pair = { ...(p as Record<string, unknown>) };
      if (pair['kind'] === undefined) {
        pair['kind'] = fallbackPairKind;
      }
      return pair;
    });
  }
  delete obj['kind'];
  return obj;
};

export const reactionRoleMessageSchema = z.preprocess(
  migrateMessageKind,
  z
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
      mode: reactionRoleModeSchema,
      /**
       * Type de feedback. `ephemeral` n'est utile que pour les paires
       * `kind: 'button'` ; pour les paires `kind: 'reaction'`, le
       * runtime retombera silencieusement sur `dm`.
       */
      feedback: reactionRoleFeedbackSchema.default('dm'),
      pairs: z.array(reactionRolePairSchema).min(1).max(20),
    })
    .superRefine((msg, ctx) => {
      if (msg.feedback === 'ephemeral' && !msg.pairs.some((p) => p.kind === 'button')) {
        ctx.addIssue({
          code: 'custom',
          path: ['feedback'],
          message:
            "Le feedback 'ephemeral' nécessite au moins une paire kind: 'button' (Discord n'autorise pas les réponses éphémères pour les réactions emoji).",
        });
      }
    }),
);
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
