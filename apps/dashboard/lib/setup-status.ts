/**
 * Helpers du middleware Next.js qui pilote la redirection
 * setup ↔ dashboard (jalon 7 PR 7.1, sous-livrable 4).
 *
 * - `decideRedirect` est pur : prend un état et un chemin, rend
 *   une décision. Testable sans mock fetch.
 * - `fetchSetupConfigured` interroge l'API Fastify
 *   (`GET /setup/status`). Sémantique : 403 = setup terminée
 *   (le preHandler `requireUnconfigured` ferme la route une fois
 *   `setup_completed_at` posé) ; 200 = setup en cours. Tout autre
 *   cas (réseau cassé, 5xx) est traité comme « non configurée »
 *   pour faire tomber l'admin sur le wizard et qu'il puisse
 *   diagnostiquer.
 */

/** Action décidée par le middleware pour une requête donnée. */
export type RedirectAction =
  | { readonly kind: 'pass-through' }
  | { readonly kind: 'redirect-to-setup' }
  | { readonly kind: 'redirect-to-home' };

/** Détermine si un chemin appartient à l'arborescence du wizard. */
const isSetupPath = (pathname: string): boolean =>
  pathname === '/setup' || pathname.startsWith('/setup/');

/**
 * Décide quoi faire d'une requête en fonction de l'état de
 * configuration de l'instance et du chemin demandé. Voir le
 * bloc-doc du module pour la sémantique des trois cas.
 */
export function decideRedirect(input: {
  readonly configured: boolean;
  readonly pathname: string;
}): RedirectAction {
  const setup = isSetupPath(input.pathname);
  if (!input.configured && !setup) {
    return { kind: 'redirect-to-setup' };
  }
  if (input.configured && setup) {
    return { kind: 'redirect-to-home' };
  }
  return { kind: 'pass-through' };
}

/** Type minimal de fetch qu'on accepte pour permettre l'injection. */
export type SetupFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Interroge `GET ${apiUrl}/setup/status`. Retourne `true` quand
 * Discord répond 403 (signe que `setup_completed_at` est posé via
 * le preHandler `requireUnconfigured`). Tout autre cas — y compris
 * un fetch qui lève — est traité comme `false` pour que l'admin
 * tombe sur le wizard et puisse diagnostiquer.
 */
export async function fetchSetupConfigured(
  apiUrl: string,
  fetchImpl: SetupFetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${apiUrl}/setup/status`, { cache: 'no-store' });
    return res.status === 403;
  } catch {
    return false;
  }
}
