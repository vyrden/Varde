/**
 * Whitelist callback URL Auth.js (jalon 7 PR 7.2 sub-livrable 6).
 *
 * Récupère la liste des hosts autorisés depuis l'API
 * (`GET /allowed-hosts`) et la cache en mémoire 30 s pour ne pas
 * taper la DB à chaque requête d'auth. Le middleware Next.js
 * consomme cette liste pour rejeter les tentatives de login depuis
 * un host non enregistré, en complément de la whitelist Discord
 * portail OAuth2.
 *
 * Politique en cas de fetch échoué :
 *
 * - **Première requête** : la liste est `null`. Le middleware
 *   tombe sur « fail open » et laisse passer (mode dégradé). Si
 *   l'API ne répond plus du tout, on préfère ne pas casser le
 *   login.
 * - **Cache existant** : on garde la dernière liste connue tant
 *   que `cacheUntil > now`. Au-delà, nouvelle tentative de fetch.
 *
 * Cette permissivité est compensée par la défense en profondeur
 * Discord — sans redirect_uri enregistré côté portail, l'OAuth
 * échoue de toute façon avant qu'aucun callback n'atteigne le
 * dashboard.
 */

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  readonly hosts: readonly string[];
  readonly until: number;
}

let cache: CacheEntry | null = null;

/** Type minimal de fetch accepté pour injection en test. */
export type AllowedHostsFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Décision pure : un host donné est-il dans la liste autorisée ?
 * Comparaison brute case-insensitive sur le `Host:` complet
 * (incluant le port s'il y en a un).
 */
export function isHostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const normalized = host.toLowerCase();
  return allowedHosts.some((h) => h.toLowerCase() === normalized);
}

/**
 * Réinitialise le cache. Réservé aux tests — n'est pas appelé
 * en runtime ; le cache se renouvelle naturellement à expiration.
 */
export function resetAllowedHostsCache(): void {
  cache = null;
}

/**
 * Retourne la liste des hosts autorisés, en utilisant le cache
 * mémoire si encore valide. Renvoie `null` quand le fetch échoue
 * et qu'il n'y a aucun cache exploitable — le middleware
 * interprète `null` comme « ne pas appliquer la whitelist » (fail
 * open).
 */
export async function getAllowedHosts(
  apiUrl: string,
  fetchImpl: AllowedHostsFetch,
  now: () => number = () => Date.now(),
): Promise<readonly string[] | null> {
  const current = now();
  if (cache && cache.until > current) {
    return cache.hosts;
  }
  try {
    const res = await fetchImpl(`${apiUrl}/allowed-hosts`, { cache: 'no-store' });
    if (!res.ok) {
      return cache?.hosts ?? null;
    }
    const body = (await res.json()) as { hosts?: unknown };
    if (!Array.isArray(body.hosts)) {
      return cache?.hosts ?? null;
    }
    const hosts = body.hosts.filter((h): h is string => typeof h === 'string');
    cache = { hosts, until: current + CACHE_TTL_MS };
    return hosts;
  } catch {
    return cache?.hosts ?? null;
  }
}
