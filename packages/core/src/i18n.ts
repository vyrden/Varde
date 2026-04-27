import type { I18nService } from '@varde/contracts';

/**
 * I18nService minimal V1. Pas de gestion ICU : simple résolution de
 * clé puis interpolation `{param}` depuis un dictionnaire en mémoire.
 *
 * Scoping : le core instancie un service par couple (module, guild) au
 * moment de construire `ctx` (à venir en PR 1.5). Le fallback retenu
 * quand la clé est absente du locale de la guild est l'anglais, avec
 * dernier recours la clé elle-même (rendue telle quelle) pour que
 * l'absence d'une chaîne reste visible sans jeter d'erreur.
 */

/** Table de messages `{ locale: { clé: message } }`. */
export type I18nMessages = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Options de construction d'un I18nService. `locale` accepte une chaîne
 * fixe ou un getter résolu à chaque appel `t()` — utile quand la locale
 * effective d'une guild peut changer pendant la durée de vie de
 * l'instance (édition `core.bot-settings.language` côté dashboard).
 */
export interface CreateI18nOptions {
  readonly messages: I18nMessages;
  readonly locale: string | (() => string);
  readonly fallbackLocale?: string;
}

const PLACEHOLDER = /\{(\w+)\}/g;

const interpolate = (
  template: string,
  params: Readonly<Record<string, string | number>> | undefined,
): string => {
  if (!params) {
    return template;
  }
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
};

/** Construit un I18nService scoped sur une locale et son fallback. */
export function createI18n(options: CreateI18nOptions): I18nService {
  const { messages, locale, fallbackLocale } = options;
  const resolveLocale = typeof locale === 'function' ? locale : () => locale;
  return {
    t(key, params) {
      const current = resolveLocale();
      const primary = messages[current]?.[key];
      if (primary !== undefined) {
        return interpolate(primary, params);
      }
      if (fallbackLocale && fallbackLocale !== current) {
        const secondary = messages[fallbackLocale]?.[key];
        if (secondary !== undefined) {
          return interpolate(secondary, params);
        }
      }
      return key;
    },
  };
}
