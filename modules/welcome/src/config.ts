import type { ConfigUi } from '@varde/contracts';
import { z } from 'zod';

/**
 * Schéma de la config `welcome` stockée sous `modules.welcome` dans
 * le snapshot guild_config.
 *
 * Trois axes indépendants : message d'accueil, message de départ,
 * auto-rôle. Plus un filtre comptes neufs qui peut court-circuiter
 * l'auto-rôle (kick ou quarantaine).
 */

const SNOWFLAKE = /^\d{17,19}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Destination du message d'accueil. */
export const welcomeDestinationSchema = z.enum(['channel', 'dm', 'both']);
export type WelcomeDestination = z.infer<typeof welcomeDestinationSchema>;

/** Action à appliquer si un compte est trop neuf. */
export const accountAgeActionSchema = z.enum(['kick', 'quarantine']);
export type AccountAgeAction = z.infer<typeof accountAgeActionSchema>;

/** Section partagée entre welcome et goodbye (texte + embed + carte). */
const messageBlockSchema = z.object({
  enabled: z.boolean().default(false),
  channelId: z
    .string()
    .regex(SNOWFLAKE, 'channelId doit être un snowflake Discord')
    .nullable()
    .default(null),
  /**
   * Template de message avec variables `{user}`, `{user.mention}`,
   * `{user.tag}`, `{guild}`, `{memberCount}`, `{accountAge}`. Le rendu
   * gère les variables absentes en les remplaçant par une valeur de
   * fallback (cf. `template-render.ts`).
   */
  message: z.string().max(2000).default(''),
  embed: z
    .object({
      enabled: z.boolean().default(false),
      color: z.string().regex(HEX_COLOR).default('#5865F2'),
    })
    .default({ enabled: false, color: '#5865F2' }),
  card: z
    .object({
      enabled: z.boolean().default(false),
      backgroundColor: z.string().regex(HEX_COLOR).default('#2C2F33'),
      /**
       * Chemin relatif (depuis VARDE_UPLOADS_DIR) vers une image de
       * fond personnalisée. Si présent, supplante `backgroundColor`
       * au rendu. Stocké via les routes upload/delete background.
       */
      backgroundImagePath: z.string().max(256).nullable().default(null),
    })
    .default({ enabled: false, backgroundColor: '#2C2F33', backgroundImagePath: null }),
});
export type WelcomeMessageBlock = z.infer<typeof messageBlockSchema>;

/**
 * Defaults concrets pour les blocs imbriqués. Zod 4 exige que
 * `.default()` reçoive un objet typé complet (les `.default()` internes
 * ne suffisent pas pour satisfaire le type inféré du parent), alors on
 * matérialise ces valeurs ici.
 */
const DEFAULT_MESSAGE_BLOCK = {
  enabled: false,
  channelId: null,
  message: '',
  embed: { enabled: false, color: '#5865F2' },
  card: { enabled: false, backgroundColor: '#2C2F33', backgroundImagePath: null },
} as const;

const DEFAULT_WELCOME_BLOCK = {
  ...DEFAULT_MESSAGE_BLOCK,
  destination: 'channel',
} as const;

const DEFAULT_AUTOROLE = {
  enabled: false,
  roleIds: [] as string[],
  delaySeconds: 0,
};

const DEFAULT_ACCOUNT_AGE_FILTER = {
  enabled: false,
  minDays: 0,
  action: 'kick',
  quarantineRoleId: null,
} as const;

export const welcomeConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    welcome: messageBlockSchema
      .extend({ destination: welcomeDestinationSchema.default('channel') })
      .default(DEFAULT_WELCOME_BLOCK),
    /**
     * Le départ ne peut pas être envoyé en DM (l'utilisateur a déjà
     * quitté le serveur, le bot et lui n'ont plus de canal commun).
     */
    goodbye: messageBlockSchema.default(DEFAULT_MESSAGE_BLOCK),
    autorole: z
      .object({
        enabled: z.boolean().default(false),
        roleIds: z
          .array(z.string().regex(SNOWFLAKE, 'roleId doit être un snowflake Discord'))
          .max(10)
          .default([]),
        /**
         * Délai d'attribution en secondes. 0 = immédiat. Valeurs ≥ 60
         * permettent de filtrer les comptes neufs raid avant attribution.
         */
        delaySeconds: z.number().int().min(0).max(86_400).default(0),
      })
      .default(DEFAULT_AUTOROLE),
    accountAgeFilter: z
      .object({
        enabled: z.boolean().default(false),
        /** Seuil en jours. 0 = désactivé (équivalent à enabled=false). */
        minDays: z.number().int().min(0).max(365).default(0),
        action: accountAgeActionSchema.default('kick'),
        /**
         * Rôle assigné en cas d'action `quarantine`. Doit être présent
         * sur la guild ; en son absence le filtre fait un no-op et log
         * une erreur (fail loud).
         */
        quarantineRoleId: z
          .string()
          .regex(SNOWFLAKE, 'quarantineRoleId doit être un snowflake Discord')
          .nullable()
          .default(null),
      })
      .default(DEFAULT_ACCOUNT_AGE_FILTER),
  })
  .superRefine((cfg, ctx) => {
    if (
      cfg.accountAgeFilter.enabled &&
      cfg.accountAgeFilter.action === 'quarantine' &&
      cfg.accountAgeFilter.quarantineRoleId === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountAgeFilter', 'quarantineRoleId'],
        message: "Action 'quarantine' nécessite un quarantineRoleId.",
      });
    }
    if (cfg.welcome.enabled && cfg.welcome.destination !== 'dm' && cfg.welcome.channelId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['welcome', 'channelId'],
        message: 'channelId requis quand destination inclut le salon.',
      });
    }
    if (cfg.goodbye.enabled && cfg.goodbye.channelId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['goodbye', 'channelId'],
        message: 'channelId requis pour le message de départ.',
      });
    }
  });

export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;

/** Alias normalisé utilisé par `defineModule` et les exports publics. */
export const configSchema = welcomeConfigSchema;

/**
 * Métadonnées de rendu dashboard. La configuration welcome est éditée
 * via une page dédiée, pas via le ConfigForm générique — pas de champ
 * scalaire simple à rendre ici.
 */
export const configUi: ConfigUi = {
  fields: [],
};

const MODULE_ID = 'welcome';

/**
 * Extrait la section `welcome` d'un snapshot guild_config et la valide.
 * Retourne la config par défaut si absente.
 */
export function resolveConfig(raw: unknown): WelcomeConfig {
  const asObj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  // biome-ignore lint/complexity/useLiteralKeys: noUncheckedIndexedAccess requires bracket notation
  const modules = asObj['modules'];
  const moduleConfig =
    modules !== undefined && modules !== null && typeof modules === 'object'
      ? (modules as Record<string, unknown>)[MODULE_ID]
      : undefined;
  return welcomeConfigSchema.parse(moduleConfig ?? {});
}
