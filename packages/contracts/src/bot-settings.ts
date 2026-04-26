/**
 * Lecture des paramètres globaux du bot par guild depuis un snapshot
 * `guild_config`. Source de vérité côté écriture : `apps/api/src/routes/bot-settings.ts`
 * (scope `core.bot-settings`). Helper neutre exposé à tous les
 * consommateurs (modules, API, dashboard) — pas de dépendance Node
 * runtime, juste du parsing typé.
 */

export interface BotSettings {
  /** Locale i18n pour les messages produits par les modules. */
  readonly language: 'en' | 'fr' | 'es' | 'de';
  /** IANA timezone (ex. `Europe/Paris`). */
  readonly timezone: string;
  /**
   * Couleur de la barre latérale des embeds, format hex `#RRGGBB`
   * pour la lecture, à convertir en number Discord par le consommateur.
   */
  readonly embedColor: string;
  /** Pareil que `embedColor` mais pré-converti en number 0xRRGGBB. */
  readonly embedColorInt: number;
}

/** Defaults appliqués quand la guild n'a jamais sauvegardé ses settings. */
export const DEFAULT_BOT_SETTINGS: BotSettings = {
  language: 'en',
  timezone: 'UTC',
  embedColor: '#5865F2',
  embedColorInt: 0x5865f2,
};

const LANGUAGES = new Set<BotSettings['language']>(['en', 'fr', 'es', 'de']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const hexToInt = (hex: string): number => {
  // hex est validé avant via HEX_COLOR_RE — pas besoin de fallback.
  return Number.parseInt(hex.slice(1), 16);
};

/**
 * Lit `core.bot-settings` depuis un snapshot `guild_config` (ce que
 * retourne `CoreConfigService.get(guildId)`). Toute valeur absente,
 * mal typée ou hors palette enum tombe sur le default.
 *
 * Usage typique côté module :
 * ```ts
 * const snapshot = await ctx.config.get(guildId);
 * const settings = readBotSettings(snapshot);
 * embed.color = settings.embedColorInt;
 * ```
 */
export function readBotSettings(snapshot: unknown): BotSettings {
  if (typeof snapshot !== 'object' || snapshot === null) return DEFAULT_BOT_SETTINGS;
  const core = (snapshot as { core?: unknown }).core;
  if (typeof core !== 'object' || core === null) return DEFAULT_BOT_SETTINGS;
  const slot = (core as { 'bot-settings'?: unknown })['bot-settings'];
  if (typeof slot !== 'object' || slot === null) return DEFAULT_BOT_SETTINGS;
  const obj = slot as Record<string, unknown>;

  const lang = obj['language'];
  const language: BotSettings['language'] =
    typeof lang === 'string' && LANGUAGES.has(lang as BotSettings['language'])
      ? (lang as BotSettings['language'])
      : DEFAULT_BOT_SETTINGS.language;

  const tz = obj['timezone'];
  const timezone = typeof tz === 'string' && tz.length > 0 ? tz : DEFAULT_BOT_SETTINGS.timezone;

  const color = obj['embedColor'];
  const embedColor =
    typeof color === 'string' && HEX_COLOR_RE.test(color)
      ? color.toUpperCase()
      : DEFAULT_BOT_SETTINGS.embedColor;

  return {
    language,
    timezone,
    embedColor,
    embedColorInt: hexToInt(embedColor),
  };
}
