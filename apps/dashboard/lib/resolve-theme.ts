/**
 * Logique pure de résolution du thème actif (jalon 7 PR 7.4.9).
 *
 * Trois préférences possibles côté utilisateur :
 *
 * - `'light'` : force le mode clair quoi qu'il arrive.
 * - `'dark'` : force le mode sombre.
 * - `'system'` : suit la préférence système (`prefers-color-scheme`).
 *
 * La résolution finale ne renvoie que `'light'` ou `'dark'` — c'est
 * la valeur appliquée comme `data-theme` sur `<html>`.
 *
 * Côté SSR, la préférence système n'est pas accessible ; on
 * retombe sur `'dark'` (D-06 du cadrage : dashboard dark-first).
 * Le client surchargera ensuite la valeur si la préférence système
 * dit autre chose, dans le script anti-flash.
 */

export type StoredTheme = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const STORED_VALUES: readonly StoredTheme[] = ['system', 'light', 'dark'];

/**
 * Normalise une valeur arbitraire (cookie, query param, DB) en une
 * `StoredTheme` valide. Tout ce qui ne match pas exactement un des
 * trois littéraux retombe sur `'system'`. Sensible à la casse — on
 * ne tolère pas `'LIGHT'`, c'est un bug d'écriture côté caller.
 */
export function normalizeStoredTheme(raw: string | undefined | null): StoredTheme {
  if (raw === undefined || raw === null) return 'system';
  if ((STORED_VALUES as readonly string[]).includes(raw)) {
    return raw as StoredTheme;
  }
  return 'system';
}

/**
 * Résout le thème effectif à appliquer.
 *
 * - `stored = 'light' | 'dark'` → renvoie cette valeur tel quel.
 * - `stored = 'system' | null | undefined` → suit
 *   `prefersColorScheme` (`'light' | 'dark' | null`).
 * - `prefersColorScheme = null` (SSR ou matchMedia indisponible)
 *   → fallback `'dark'`.
 */
export function resolveEffectiveTheme(
  stored: StoredTheme | null | undefined,
  prefersColorScheme: EffectiveTheme | null,
): EffectiveTheme {
  if (stored === 'light') return 'light';
  if (stored === 'dark') return 'dark';
  // 'system', null, undefined → suit le système
  if (prefersColorScheme === 'light') return 'light';
  if (prefersColorScheme === 'dark') return 'dark';
  return 'dark';
}
