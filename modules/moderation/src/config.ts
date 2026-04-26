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
 * Une règle d'automod. Évaluée à chaque `guild.messageCreate` non-bot
 * et non-bypass. La première règle qui matche pose son action et
 * stoppe l'évaluation pour ce message.
 *
 * - `kind: 'blacklist'` : `pattern` est traité comme une chaîne
 *   recherchée case-insensitive (substring match). Adapté au listage
 *   de mots interdits courants.
 * - `kind: 'regex'` : `pattern` est compilé en RegExp avec flag `i`.
 *   Plus puissant mais nécessite que l'admin connaisse la syntaxe.
 *
 * Actions :
 * - `delete` : supprime le message.
 * - `warn` : laisse le message, écrit une entrée audit `automod.triggered`.
 * - `mute` : supprime le message + assigne le rôle muet (si configuré
 *   via `mutedRoleId`). `durationMs` optionnel programme une levée
 *   automatique via le scheduler (mêmes job keys que `/tempmute`).
 */
export const automodRuleSchema = z.object({
  /** ID stable côté config (snowflake-like ULID-like). */
  id: z.string().min(1).max(64),
  /** Description humaine, affichée dans le dashboard. */
  label: z.string().min(1).max(120),
  kind: z.enum(['blacklist', 'regex']),
  pattern: z.string().min(1).max(512),
  action: z.enum(['delete', 'warn', 'mute']),
  /** Pour `action: 'mute'` uniquement — durée du mute en ms. `null` = mute indéfini (admin doit unmute manuellement). */
  durationMs: z.number().int().min(1_000).nullable().default(null),
  enabled: z.boolean().default(true),
});

export type AutomodRule = z.infer<typeof automodRuleSchema>;

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
