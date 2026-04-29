import { type NextRequest, NextResponse } from 'next/server';

import { type AllowedHostsFetch, getAllowedHosts, isHostAllowed } from './lib/allowed-hosts';
import { decideRedirect, fetchSetupConfigured, type SetupFetch } from './lib/setup-status';

/**
 * Middleware Next.js — jalon 7 PR 7.1 sous-livrable 4.
 *
 * Pilote la redirection setup ↔ dashboard pour toute requête entrante.
 * Tant que `setup_completed_at` est null côté API :
 *
 * - n'importe quel chemin non-`/setup/*` est redirigé vers
 *   `/setup/welcome`, pour que l'admin tombe sur le wizard à
 *   l'ouverture du domaine ;
 * - les chemins `/setup/*` passent (le wizard tourne).
 *
 * Une fois la setup finalisée :
 *
 * - les chemins `/setup/*` sont redirigés vers `/`, pour empêcher
 *   l'admin de rejouer le wizard ;
 * - les autres chemins passent normalement.
 *
 * **Cache positif éternel.** Une fois que l'API a rapporté un 403
 * (= setup configurée), on cache cette information dans une variable
 * de module pour la durée de vie du worker. La PR 2 du chantier 2
 * introduira une page admin permettant de modifier les credentials,
 * mais elle ne pourra pas re-passer l'instance en mode « non
 * configurée » — donc le cache positif est sûr. Avant la première
 * observation 403, le middleware tape l'API à chaque requête —
 * acceptable parce que pré-setup il n'y a qu'un seul utilisateur
 * actif (l'admin qui clique le wizard) et que la route est
 * rate-limitée à 10 req/min/IP côté API.
 *
 * **Auth.js et internals.** Les routes `/api/auth/*` (callbacks
 * NextAuth pour le login Discord) ne sont accessibles qu'une fois
 * la setup terminée — durant le wizard, le redirect-to-setup les
 * couvre. Le `matcher` exclut les ressources statiques Next.js
 * (`_next/static`, `_next/image`) et `favicon.ico` pour ne pas
 * payer un fetch d'API par image.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';

// `VARDE_DISABLE_CONFIGURED_CACHE=1` désactive le cache positif. On
// ne peut pas se contenter de `NODE_ENV` parce que `next dev` le
// force à `'development'` peu importe ce que l'env extérieur a posé.
// Le flag dédié est posé par `playwright.config.ts` côté CI pour que
// les E2E qui basculent l'état du mock entre `configured: true` et
// `configured: false` voient l'évolution (sinon le worker retient
// pour toujours le premier `true` observé).
const CACHE_ENABLED = process.env['VARDE_DISABLE_CONFIGURED_CACHE'] !== '1';

let configuredCache: boolean | null = null;
const fetchImpl: SetupFetch = (input, init) => fetch(input, init);
const allowedHostsFetchImpl: AllowedHostsFetch = (input, init) => fetch(input, init);

const isConfigured = async (): Promise<boolean> => {
  if (CACHE_ENABLED && configuredCache === true) {
    return true;
  }
  const result = await fetchSetupConfigured(API_URL, fetchImpl);
  if (CACHE_ENABLED && result) {
    configuredCache = true;
  }
  return result;
};

/**
 * Whitelist callback Auth.js : pour les routes `/api/auth/*`, on
 * vérifie que le `Host:` de la requête est dans la liste persistée
 * (`base_url` + `additional_urls` + env). Sinon 403 avec un
 * message explicite — l'UI dashboard du même host indiquera à
 * l'admin d'ajouter cette URL via la section « URLs d'accès ».
 *
 * Fail open : si l'API n'a jamais répondu (boot, instance
 * unreachable), on laisse passer — la défense en profondeur
 * Discord OAuth2 attrape de toute façon les redirect_uri non
 * autorisés. La whitelist est un confort UX, pas une frontière
 * de sécurité absolue.
 */
const isAuthPath = (pathname: string): boolean =>
  pathname === '/api/auth' || pathname.startsWith('/api/auth/');

const enforceHostWhitelist = async (request: NextRequest): Promise<NextResponse | null> => {
  if (!isAuthPath(request.nextUrl.pathname)) {
    return null;
  }
  const host = request.headers.get('host');
  if (host === null) {
    return null;
  }
  const allowed = await getAllowedHosts(API_URL, allowedHostsFetchImpl);
  if (allowed === null) {
    // Fail open : pas de liste exploitable → pas d'enforcement.
    return null;
  }
  if (isHostAllowed(host, allowed)) {
    return null;
  }
  return new NextResponse(
    JSON.stringify({
      error: 'host_not_allowed',
      message: `Le host '${host}' n'est pas dans la liste des URLs autorisées de cette instance. Ajoutez-le via la page admin « URLs d'accès » avant de retenter le login.`,
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  );
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const denied = await enforceHostWhitelist(request);
  if (denied !== null) {
    return denied;
  }
  const configured = await isConfigured();
  const action = decideRedirect({ configured, pathname: request.nextUrl.pathname });
  switch (action.kind) {
    case 'redirect-to-setup':
      return NextResponse.redirect(new URL('/setup/welcome', request.url));
    case 'redirect-to-home':
      return NextResponse.redirect(new URL('/', request.url));
    case 'pass-through':
      return NextResponse.next();
  }
}

/**
 * Matcher Next.js : exécute le middleware sur toutes les requêtes
 * sauf les ressources statiques internes. Le pattern négatif est la
 * forme recommandée par Next.js pour ce cas.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
