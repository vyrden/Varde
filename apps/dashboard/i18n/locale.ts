import { cookies, headers } from 'next/headers';

import { defaultLocale, isLocale, type Locale, localeCookieName } from './config';

/**
 * Résout la locale active pour la requête courante.
 *
 * Priorité :
 *   1. Cookie `NEXT_LOCALE` posé par les préférences utilisateur.
 *   2. En-tête `Accept-Language` du navigateur (premier match).
 *   3. `defaultLocale` (FR).
 *
 * Aucun appel async externe — résolution stricte sur le contexte
 * de la requête. Réutilisable côté server components et server
 * actions.
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(localeCookieName)?.value;
  if (isLocale(fromCookie)) {
    return fromCookie;
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language');
  const fromHeader = acceptLanguage ? parseAcceptLanguage(acceptLanguage) : undefined;
  if (fromHeader && isLocale(fromHeader)) {
    return fromHeader;
  }

  return defaultLocale;
}

/**
 * Extrait la première locale supportée d'une chaîne `Accept-Language`.
 * Implémentation volontairement minimale : parser RFC 4647 strict
 * surdimensionné pour deux locales.
 */
export function parseAcceptLanguage(header: string): string | undefined {
  const items = header.split(',');
  for (const raw of items) {
    const tag = raw.split(';')[0]?.trim().toLowerCase();
    if (!tag) continue;
    const primary = tag.split('-')[0];
    if (primary && isLocale(primary)) {
      return primary;
    }
  }
  return undefined;
}
