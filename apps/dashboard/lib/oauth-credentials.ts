/**
 * Client dashboard pour `GET /internal/oauth-credentials` (jalon 7
 * PR 7.5 sub-livrable 2).
 *
 * Pourquoi un client dédié plutôt qu'un fetch ad-hoc :
 *
 * - **Cache mémoire avec TTL.** Auth.js v5 en config dynamique appelle
 *   le constructeur des providers à chaque requête. Sans cache, on
 *   tape l'API à chaque navigation — du à coup tu paies un round-trip
 *   par lecture de session. TTL 60 s par défaut, suffisant en
 *   exploitation, court en cas de rotation de credentials (le bouton
 *   `invalidate()` est exposé pour forcer un refetch quand on connaît
 *   le moment exact de la rotation).
 *
 * - **Inflight de-duplication.** Au boot du dashboard, plusieurs
 *   requêtes concurrentes peuvent tirer Auth.js → si on n'attentionne
 *   pas, N requêtes parallèles font N fetches concurrents au lieu d'un
 *   seul. On stocke la `Promise` en cours et tout le monde attend la
 *   même.
 *
 * - **Distinction 404 vs erreur.** L'API renvoie 404 quand
 *   `instance_config` n'a pas encore de `discordAppId` ou de
 *   `discordClientSecret` — état métier normal pendant le wizard, pas
 *   une panne. On retourne `null` que le caller doit gérer (typiquement
 *   « rediriger vers /setup »). Tout autre statut HTTP ou erreur
 *   réseau est un bug de configuration / d'infra : on `throw` pour
 *   que ça remonte clairement, pas qu'un dashboard tourne avec des
 *   credentials vides en silence.
 *
 * - **Bearer rejoué à l'identique.** Le secret partagé est lu une
 *   fois à la construction du client et ré-injecté tel quel dans le
 *   header `Authorization` de chaque fetch. Pas de transformation,
 *   pas de signature dérivée — l'API compare timing-safe au même
 *   secret côté `apps/api`.
 */

export interface OAuthCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface OAuthCredentialsClient {
  /**
   * Retourne les credentials OAuth Discord, depuis le cache si frais,
   * sinon depuis l'API. `null` quand l'instance n'a pas encore de
   * credentials posés (404 — wizard pas terminé). Throw sur tout autre
   * échec (auth invalide, réseau, statut inattendu).
   */
  get(): Promise<OAuthCredentials | null>;
  /** Invalide le cache : prochain `get()` refetch. */
  invalidate(): void;
}

export interface CreateOAuthCredentialsClientOptions {
  /** Base URL de l'API (sans slash final). Ex. `http://localhost:4000`. */
  readonly apiUrl: string;
  /** Secret partagé pour le Bearer (= `VARDE_AUTH_SECRET`). */
  readonly authSecret: string;
  /** TTL du cache en ms. Défaut : 60 000 (60 s). */
  readonly ttlMs?: number;
  /** Override de `fetch` pour les tests. */
  readonly fetchImpl?: typeof fetch;
  /** Override de `Date.now` pour les tests (faux clock). */
  readonly now?: () => number;
}

interface CacheEntry {
  readonly value: OAuthCredentials | null;
  readonly expiresAt: number;
}

export function createOAuthCredentialsClient(
  options: CreateOAuthCredentialsClientOptions,
): OAuthCredentialsClient {
  const ttlMs = options.ttlMs ?? 60_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? ((): number => Date.now());
  const url = `${options.apiUrl}/internal/oauth-credentials`;

  let cache: CacheEntry | null = null;
  let inflight: Promise<OAuthCredentials | null> | null = null;

  const fetchFresh = async (): Promise<OAuthCredentials | null> => {
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${options.authSecret}` },
      cache: 'no-store',
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`/internal/oauth-credentials returned ${res.status}`);
    }
    return (await res.json()) as OAuthCredentials;
  };

  return {
    async get() {
      const t = now();
      if (cache !== null && cache.expiresAt > t) {
        return cache.value;
      }
      if (inflight !== null) {
        return inflight;
      }
      inflight = (async () => {
        try {
          const value = await fetchFresh();
          cache = { value, expiresAt: now() + ttlMs };
          return value;
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
    invalidate() {
      cache = null;
    },
  };
}

/**
 * Singleton de production. Construit au premier appel à partir des
 * variables d'environnement bootstrap (`VARDE_API_URL`,
 * `VARDE_AUTH_SECRET`). Fail-fast si l'une manque — c'est un
 * problème de déploiement, pas un état runtime à gérer.
 */
let singleton: OAuthCredentialsClient | null = null;

export function getOAuthCredentialsClient(): OAuthCredentialsClient {
  if (singleton !== null) {
    return singleton;
  }
  const apiUrl = process.env['VARDE_API_URL'];
  const authSecret = process.env['VARDE_AUTH_SECRET'];
  if (apiUrl === undefined || apiUrl.length === 0) {
    throw new Error('VARDE_API_URL est requis pour appeler /internal/oauth-credentials');
  }
  if (authSecret === undefined || authSecret.length === 0) {
    throw new Error('VARDE_AUTH_SECRET est requis pour appeler /internal/oauth-credentials');
  }
  singleton = createOAuthCredentialsClient({ apiUrl, authSecret });
  return singleton;
}
