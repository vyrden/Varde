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

export const moderationConfigSchema = z.object({
  version: z.literal(1).default(1),
  mutedRoleId: z
    .string()
    .regex(SNOWFLAKE, 'doit être un snowflake Discord (17 à 20 chiffres)')
    .nullable()
    .default(null),
  dmOnSanction: z.boolean().default(true),
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
