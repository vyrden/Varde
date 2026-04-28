/**
 * Configuration centrale de l'internationalisation du dashboard.
 *
 * V1 : deux locales, FR par défaut. Ajouter une nouvelle locale
 * passe par trois étapes :
 *
 * 1. Étendre `locales` ci-dessous.
 * 2. Créer `apps/dashboard/messages/<code>.json`.
 * 3. Documenter le code de langue dans `apps/dashboard/i18n/README.md`.
 */

export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fr';

/**
 * Nom du cookie de dispatch. Lu côté serveur via le middleware,
 * écrit côté client par les préférences utilisateur (PR 7.4).
 */
export const localeCookieName = 'NEXT_LOCALE';

export function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && (locales as readonly string[]).includes(value);
}
