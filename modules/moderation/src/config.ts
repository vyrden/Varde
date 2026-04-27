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
 * Action atomique d'une règle automod. Une règle expose désormais
 * `actions: AutomodAction[]` (multi-sélection) — combinaisons libres :
 * `['delete']`, `['warn']`, `['delete', 'warn']`, `['delete', 'mute']`,
 * `['warn', 'mute']`, `['delete', 'warn', 'mute']`, etc.
 *
 * - `delete` : supprime le message.
 * - `warn`   : envoie un DM d'avertissement au membre (si
 *              `dmOnSanction` est actif). N'a pas d'effet visible
 *              côté Discord en dehors du DM.
 * - `mute`   : assigne le rôle muet (si `mutedRoleId` est configuré).
 *              `durationMs` optionnel programme une levée automatique
 *              via le scheduler (mêmes job keys que `/tempmute`).
 *
 * Ordre d'exécution interne (cf. `applyActions` dans automod.ts) :
 * 1. delete (kill du message au plus tôt) ;
 * 2. mute  (rôle + scheduler) ;
 * 3. DM unique consolidé en fin de pipeline si au moins une action
 *    visible a abouti.
 */
export const automodActionSchema = z.enum(['delete', 'warn', 'mute']);
export type AutomodAction = z.infer<typeof automodActionSchema>;

/**
 * Tableau d'actions : au moins un item, max 3. La dédup est faite au
 * point d'entrée (UI dashboard `normalizeActions` + `migrateLegacyAction`
 * en preprocess) plutôt qu'avec `z.transform`, parce que le JSON
 * Schema export utilisé par Fastify ne sait pas représenter les
 * transforms (lève "Transforms cannot be represented in JSON Schema").
 * Le runtime côté `applyActions` utilise `actions.includes(...)` —
 * les doublons éventuels ne déclenchent pas d'exécution multiple.
 */
export const automodActionsSchema = z
  .array(automodActionSchema)
  .min(1, 'au moins une action requise')
  .max(3);

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
  /** Multi-actions composables. Voir `automodActionsSchema`. */
  actions: automodActionsSchema,
  /** Pour `actions.includes('mute')` uniquement — durée du mute en ms. `null` = mute indéfini (admin doit unmute manuellement). */
  durationMs: z.number().int().min(1_000).nullable().default(null),
  enabled: z.boolean().default(true),
} as const;

/**
 * Hydrate une règle stockée au format legacy (`action: AutomodAction`)
 * vers le nouveau format (`actions: AutomodAction[]`). Idempotent —
 * si `actions` est déjà présent, le préprocess est un no-op. Permet
 * la rétro-compat sur les configs persistées avant la PR multi-actions.
 */
const migrateLegacyAction = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if ('actions' in obj) return obj;
  if (typeof obj['action'] === 'string') {
    const { action, ...rest } = obj;
    return { ...rest, actions: [action] };
  }
  return obj;
};

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
 * Règle invites — kind `invites`. Détecte les invitations Discord dans
 * le contenu (`discord.gg/xyz`, `discord.com/invite/xyz`, et variantes
 * `discordapp.com`). Couverture pragmatique des plus communes ; les
 * invites masquées via raccourci `.gg/xyz` (sans schéma) sont aussi
 * détectées.
 *
 * - `allowOwnGuild` : si `true` (défaut), les invites du serveur
 *   courant sont tolérées. Nécessite que le bot puisse résoudre les
 *   invites — V1 implémentation simple : on ne whitelist rien (la
 *   distinction « propre serveur vs autre » nécessite un appel API
 *   pour résoudre chaque invite, hors-scope V1). Le flag est exposé
 *   pour préparer l'évolution.
 */
export const automodInvitesRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('invites'),
  allowOwnGuild: z.boolean().default(true),
});

/**
 * Règle liens externes — kind `links`. Détecte les URLs `http(s)://`
 * dans le contenu. Deux modes :
 *
 * - `block-all` (défaut) : tout URL déclenche.
 * - `whitelist` : seuls les liens dont le domaine n'est PAS dans
 *   `whitelist` déclenchent. Les sous-domaines sont autorisés
 *   (`whitelist: ['github.com']` couvre `*.github.com`).
 */
export const automodLinksRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('links'),
  mode: z.enum(['block-all', 'whitelist']).default('block-all'),
  whitelist: z.array(z.string().min(1).max(120)).max(50).default([]),
});

/**
 * Règle majuscules excessives — kind `caps`. Déclenche si le message
 * contient une proportion de lettres majuscules supérieure à `ratio`,
 * uniquement pour les messages d'au moins `minLength` caractères
 * (évite les faux positifs sur les sigles type `OK`, `LOL`).
 */
export const automodCapsRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('caps'),
  minLength: z.number().int().min(4).max(200).default(8),
  ratio: z.number().min(0.3).max(1).default(0.7),
});

/**
 * Règle emojis excessifs — kind `emojis`. Compte les emojis (Unicode
 * + custom Discord `<:name:id>` et `<a:name:id>`) ; déclenche au-delà
 * de `maxCount`.
 */
export const automodEmojisRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('emojis'),
  maxCount: z.number().int().min(2).max(50).default(10),
});

/**
 * Règle spoilers excessifs — kind `spoilers`. Compte les blocs
 * `||texte||` ; déclenche au-delà de `maxCount`. Utile pour empêcher
 * un membre de masquer un mur de texte derrière des spoilers.
 */
export const automodSpoilersRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('spoilers'),
  maxCount: z.number().int().min(2).max(20).default(5),
});

/**
 * Règle mentions de masse — kind `mentions`. Compte les mentions
 * `<@id>` (membres) et optionnellement `<@&id>` (rôles). Déclenche
 * au-delà de `maxCount`.
 */
export const automodMentionsRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('mentions'),
  maxCount: z.number().int().min(2).max(50).default(5),
  includeRoles: z.boolean().default(true),
});

/**
 * Règle zalgo — kind `zalgo`. Détecte les caractères « combinants »
 * (Unicode block U+0300..U+036F + autres marques diacritiques)
 * empilés. Le ratio = `combining marks / total chars`. Déclenche
 * au-delà de `ratio`.
 */
export const automodZalgoRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('zalgo'),
  ratio: z.number().min(0.1).max(1).default(0.3),
});

/** Langue d'une règle `keyword-list` : pioche dans le vocab seedé. */
export const automodKeywordListLanguageSchema = z.enum(['fr', 'en', 'all']);
export type AutomodKeywordListLanguage = z.infer<typeof automodKeywordListLanguageSchema>;

/**
 * Règle wordlist multi-langue — kind `keyword-list`. Alternative
 * transparente à `ai-classify` : le matching est rule-based (substring
 * case-insensitive, accent-insensitive), donc déterministe et
 * inspectable côté admin.
 *
 * Le runtime combine :
 * 1. Le vocabulaire seedé (`KEYWORD_LIST_VOCABULARY` dans `automod.ts`)
 *    pour la langue choisie et chacune des `categories` cochées.
 * 2. Les `customWords` ajoutés par l'admin (étendent le vocab seedé).
 *
 * Aucun coût IA, aucune dépendance externe. Si l'admin coche `all`,
 * FR + EN sont fusionnés.
 */
export const automodKeywordListRuleSchema = z.object({
  ...SHARED_RULE_FIELDS,
  kind: z.literal('keyword-list'),
  language: automodKeywordListLanguageSchema.default('all'),
  categories: z.array(automodAiCategorySchema).min(1),
  customWords: z.array(z.string().min(1).max(120)).max(200).default([]),
});

/**
 * Une règle d'automod. Évaluée à chaque `guild.messageCreate` non-bot
 * et non-bypass. La première règle qui matche pose son action et
 * stoppe l'évaluation pour ce message.
 *
 * Le `preprocess(migrateLegacyAction, …)` hydrate les règles stockées
 * en base avant la PR multi-actions (champ `action: AutomodAction`)
 * vers le nouveau format (`actions: AutomodAction[]`). Sans rétro-
 * compat ici, un `config.get` planterait sur toute config existante.
 */
export const automodRuleSchema = z.preprocess(
  migrateLegacyAction,
  z.discriminatedUnion('kind', [
    automodBlacklistRuleSchema,
    automodRegexRuleSchema,
    automodRateLimitRuleSchema,
    automodAiClassifyRuleSchema,
    automodInvitesRuleSchema,
    automodLinksRuleSchema,
    automodCapsRuleSchema,
    automodEmojisRuleSchema,
    automodSpoilersRuleSchema,
    automodMentionsRuleSchema,
    automodZalgoRuleSchema,
    automodKeywordListRuleSchema,
  ]),
);

export type AutomodRule = z.infer<typeof automodRuleSchema>;
export type AutomodBlacklistRule = z.infer<typeof automodBlacklistRuleSchema>;
export type AutomodRegexRule = z.infer<typeof automodRegexRuleSchema>;
export type AutomodRateLimitRule = z.infer<typeof automodRateLimitRuleSchema>;
export type AutomodAiClassifyRule = z.infer<typeof automodAiClassifyRuleSchema>;
export type AutomodInvitesRule = z.infer<typeof automodInvitesRuleSchema>;
export type AutomodLinksRule = z.infer<typeof automodLinksRuleSchema>;
export type AutomodCapsRule = z.infer<typeof automodCapsRuleSchema>;
export type AutomodEmojisRule = z.infer<typeof automodEmojisRuleSchema>;
export type AutomodSpoilersRule = z.infer<typeof automodSpoilersRuleSchema>;
export type AutomodMentionsRule = z.infer<typeof automodMentionsRuleSchema>;
export type AutomodZalgoRule = z.infer<typeof automodZalgoRuleSchema>;
export type AutomodKeywordListRule = z.infer<typeof automodKeywordListRuleSchema>;

export const automodConfigSchema = z.object({
  /** Liste ordonnée — première règle qui matche gagne. */
  rules: z.array(automodRuleSchema).default([]),
  /** Snowflakes des rôles dont les membres ne sont pas évalués. */
  bypassRoleIds: z
    .array(z.string().regex(SNOWFLAKE, 'doit être un snowflake Discord (17 à 20 chiffres)'))
    .default([]),
});

export type AutomodConfig = z.infer<typeof automodConfigSchema>;

/**
 * Mode d'un salon restreint :
 * - `commands` : autorise seulement les messages qui commencent par `/`.
 * - `images`   : autorise seulement les messages avec au moins une
 *                attachement image (extension classique : png, jpg, …).
 * - `videos`   : autorise seulement les messages avec au moins une
 *                attachement vidéo (mp4, mov, webm, …).
 *
 * Plusieurs modes peuvent coexister par salon — ils sont OR-és : un
 * message valide tant qu'il satisfait AU MOINS UN des modes.
 */
export const restrictedChannelModeSchema = z.enum(['commands', 'images', 'videos']);
export type RestrictedChannelMode = z.infer<typeof restrictedChannelModeSchema>;

export const restrictedChannelSchema = z.object({
  channelId: z.string().regex(SNOWFLAKE, 'doit être un snowflake'),
  modes: z.array(restrictedChannelModeSchema).min(1, 'au moins un mode requis').max(3),
});
export type RestrictedChannel = z.infer<typeof restrictedChannelSchema>;

export const moderationConfigSchema = z.object({
  version: z.literal(1).default(1),
  mutedRoleId: z
    .string()
    .regex(SNOWFLAKE, 'doit être un snowflake Discord (17 à 20 chiffres)')
    .nullable()
    .default(null),
  dmOnSanction: z.boolean().default(true),
  automod: automodConfigSchema.default({ rules: [], bypassRoleIds: [] }),
  /**
   * Salons restreints — par salon, contraint le contenu accepté.
   * Tout message qui n'entre dans aucun des modes du salon est
   * supprimé (et un DM optionnel est envoyé selon `dmOnSanction`).
   * Évalué AVANT les règles automod (gain de coût + sémantique
   * différente : c'est une politique de salon, pas un filtre de
   * contenu nuisible).
   */
  restrictedChannels: z.array(restrictedChannelSchema).default([]),
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
  const modules = asObj['modules'];
  const moduleConfig =
    modules !== undefined && modules !== null && typeof modules === 'object'
      ? (modules as Record<string, unknown>)[MODULE_ID]
      : undefined;
  return moderationConfigSchema.parse(moduleConfig ?? {});
}
