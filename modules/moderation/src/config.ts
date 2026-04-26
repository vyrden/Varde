import type { ConfigUi } from '@varde/contracts';
import { z } from 'zod';

/**
 * Configuration du module moderation. PR 4.M.1 expose un schéma
 * minimal pour que la page dashboard générique soit immédiatement
 * exploitable. Champs étendus (templates de DM, log channel,
 * sévérité automod) viendront en PR 4.M.3.
 *
 * - `mutedRoleId` : snowflake du rôle assigné par `/mute` et
 *   `/tempmute`. Sans ce rôle configuré, les commandes mute/unmute
 *   répondront en erreur (PR 4.M.2). `null` par défaut — l'admin
 *   crée le rôle Discord côté serveur et colle son ID ici.
 * - `dmOnSanction` : si vrai (défaut), le bot tente d'envoyer un DM
 *   au membre sanctionné avec le motif. Échec silencieux si le
 *   membre a fermé ses DMs (les sanctions s'appliquent quand même).
 */
const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Action commune à toutes les règles automod :
 * - `delete` : supprime le message.
 * - `warn`   : laisse le message, écrit une entrée audit
 *              `automod.triggered`.
 * - `mute`   : supprime le message + assigne le rôle muet (si
 *              configuré via `mutedRoleId`). `durationMs` optionnel
 *              programme une levée automatique via le scheduler
 *              (mêmes job keys que `/tempmute`).
 */
export const automodActionSchema = z.enum(['delete', 'warn', 'mute']);
export type AutomodAction = z.infer<typeof automodActionSchema>;

/**
 * Catalogue de catégories de risque exposées au classifier IA. Restreint
 * exprès — un admin ne devrait pas pouvoir construire un classifier
 * arbitraire (sinon les coûts deviennent imprévisibles). Le label
 * `safe` est toujours implicitement ajouté côté runtime pour offrir
 * une voie de sortie au modèle.
 */
export const automodAiCategorySchema = z.enum([
  'toxicity',
  'harassment',
  'hate',
  'sexual',
  'self-harm',
  'spam',
]);
export type AutomodAiCategory = z.infer<typeof automodAiCategorySchema>;

const SHARED_RULE_FIELDS = {
  /** ID stable côté config (snowflake-like ULID-like). */
  id: z.string().min(1).max(64),
  /** Description humaine, affichée dans le dashboard. */
  label: z.string().min(1).max(120),
  action: automodActionSchema,
  /** Pour `action: 'mute'` uniquement — durée du mute en ms. `null` = mute indéfini (admin doit unmute manuellement). */
  durationMs: z.number().int().min(1_000).nullable().default(null),
  enabled: z.boolean().default(true),
} as const;

/**
 * Règle textuelle (substring) — kind `blacklist`. `pattern` est une
 * chaîne recherchée case-insensitive (substring match), adaptée au
 * listage de mots interdits courants.
 */
export const automodBlacklistRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('blacklist'),
  pattern: z.string().min(1).max(512),
});

/**
 * Règle regex — kind `regex`. `pattern` est compilé en RegExp avec
 * flag `i`. Plus puissant que la blacklist mais nécessite que l'admin
 * connaisse la syntaxe ; un pattern invalide rend la règle inerte
 * (logs.debug).
 */
export const automodRegexRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('regex'),
  pattern: z.string().min(1).max(512),
});

/**
 * Règle de rate-limit — kind `rate-limit`. Compte les messages d'un
 * même auteur sur une fenêtre glissante ; si le seuil est dépassé,
 * l'action est appliquée au message qui a fait franchir la limite.
 *
 * - `count` : nombre maximum de messages avant déclenchement (>= 2).
 * - `windowMs` : largeur de la fenêtre glissante en ms.
 * - `scope` : `user-guild` (défaut) compte tous les messages de
 *   l'utilisateur sur le serveur ; `user-channel` ne compte que ceux
 *   postés dans le même salon.
 *
 * État maintenu en mémoire dans le runtime (cf. `automod.ts`) — pas
 * de persistance, le compteur reset au reboot. Acceptable pour V1
 * (rate-limit court-terme, ordre de la minute).
 */
export const automodRateLimitRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('rate-limit'),
  count: z.number().int().min(2).max(50),
  windowMs: z
    .number()
    .int()
    .min(1_000)
    .max(10 * 60 * 1_000),
  scope: z.enum(['user-guild', 'user-channel']).default('user-guild'),
});

/**
 * Règle de classification IA — kind `ai-classify`. Délègue au
 * `ctx.ai.classify(text, labels)` la décision binaire « ce message
 * est-il problématique ». Si l'IA retourne une catégorie listée dans
 * `categories`, l'action est appliquée.
 *
 * `null` côté `ctx.ai` ⇒ règle inerte (audit-only, logs.debug). Le
 * runtime borne aussi la longueur de `content` pour limiter le coût.
 */
export const automodAiClassifyRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('ai-classify'),
  categories: z.array(automodAiCategorySchema).min(1),
  /** Longueur max du contenu envoyé à l'IA (caractères). Tronque silencieusement au-delà. */
  maxContentLength: z.number().int().min(64).max(2_000).default(500),
});

/**
 * Une règle d'automod. Évaluée à chaque `guild.messageCreate` non-bot
 * et non-bypass. La première règle qui matche pose son action et
 * stoppe l'évaluation pour ce message.
 */
export const automodRuleSchema = z.discriminatedUnion('kind', [
  automodBlacklistRuleSchema,
  automodRegexRuleSchema,
  automodRateLimitRuleSchema,
  automodAiClassifyRuleSchema,
]);

export type AutomodRule = z.infer<typeof automodRuleSchema>;
export type AutomodBlacklistRule = z.infer<typeof automodBlacklistRuleSchema>;
export type AutomodRegexRule = z.infer<typeof automodRegexRuleSchema>;
export type AutomodRateLimitRule = z.infer<typeof automodRateLimitRuleSchema>;
export type AutomodAiClassifyRule = z.infer<typeof automodAiClassifyRuleSchema>;

export const automodConfigSchema = z.object({
  /** Liste ordonnée — première règle qui matche gagne. */
  rules: z.array(automodRuleSchema).default([]),
  /** Snowflakes des rôles dont les membres ne sont pas évalués. */
  bypassRoleIds: z
    .array(z.string().regex(SNOWFLAKE, 'doit être un snowflake Discord (17 à 20 chiffres)'))
    .default([]),
});

export type AutomodConfig = z.infer<typeof automodConfigSchema>;

export const moderationConfigSchema = z.object({
  version: z.literal(1).default(1),
  mutedRoleId: z
    .string()
    .regex(SNOWFLAKE, 'doit être un snowflake Discord (17 à 20 chiffres)')
    .nullable()
    .default(null),
  dmOnSanction: z.boolean().default(true),
  automod: automodConfigSchema.default({ rules: [], bypassRoleIds: [] }),
});

export type ModerationConfig = z.infer<typeof moderationConfigSchema>;

export const configSchema = moderationConfigSchema;

/**
 * Métadonnées de rendu dashboard. La page moderation aura sa propre
 * UI dédiée (PR 4.M.3) — pas de ConfigForm générique en V1.
 */
export const configUi: ConfigUi = {
  fields: [],
};

const MODULE_ID = 'moderation';

/**
 * Extrait la section `moderation` d'un snapshot guild_config et la
 * valide. Forme du snapshot : `{ core: ..., modules: { moderation: ... } }`.
 */
export function resolveConfig(raw: unknown): ModerationConfig {
  const asObj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  // biome-ignore lint/complexity/useLiteralKeys: noUncheckedIndexedAccess requires bracket notation
  const modules = asObj['modules'];
  const moduleConfig =
    modules !== undefined && modules !== null && typeof modules === 'object'
      ? (modules as Record<string, unknown>)[MODULE_ID]
      : undefined;
  return moderationConfigSchema.parse(moduleConfig ?? {});
}
