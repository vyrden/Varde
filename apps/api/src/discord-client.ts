import { DependencyFailureError } from '@varde/contracts';

/**
 * Surface restreinte d'un guild renvoyé par l'API Discord.
 * `permissions` est un bitfield stringifié (format Discord V10+).
 */
export interface DiscordGuild {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly permissions: string;
}

/** Permission Discord `MANAGE_GUILD` (bit 0x20). */
export const PERMISSION_MANAGE_GUILD = 0x20n;

/**
 * Client minimal vers l'API Discord REST. V1 expose un seul endpoint
 * (`/users/@me/guilds`) avec :
 *
 * - **Cache TTL par access_token** (défaut 5 min). Les guilds d'un
 *   utilisateur changent rarement ; les pages du dashboard tapent
 *   plusieurs routes par rendu (onboarding + modules + audit…) qui
 *   repassent toutes par ce check.
 * - **Dédup in-flight** : quand plusieurs requêtes concurrentes
 *   arrivent pour le même token et que le cache est froid / périmé,
 *   elles partagent la même promesse — une seule fenêtre réseau
 *   part vers Discord. Essentiel quand Next.js parallélise les
 *   Server Components sur un même rendu.
 * - **Fallback stale sur 429** : si Discord rate-limit (`retry-after`
 *   court, cf. docs/global rate limit), on renvoie le cache périmé
 *   au lieu de propager l'erreur ; le dashboard survit à une
 *   rafale de F5. Si aucun cache n'est disponible (cold start +
 *   429 immédiat), on propage l'erreur comme avant.
 *
 * Le fetch est injectable pour que les tests puissent fournir un
 * double ; production utilise `globalThis.fetch`.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CreateDiscordClientOptions {
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  /** TTL du cache en ms. Défaut : 300 000 (5 min). */
  readonly cacheTtlMs?: number;
  /** Base URL Discord. Défaut : `https://discord.com/api/v10`. */
  readonly baseUrl?: string;
}

export interface DiscordClient {
  readonly fetchUserGuilds: (accessToken: string) => Promise<readonly DiscordGuild[]>;
  /** Efface le cache (utile pour tests et pour après logout). */
  readonly invalidate: (accessToken?: string) => void;
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly guilds: readonly DiscordGuild[];
}

export function createDiscordClient(options: CreateDiscordClientOptions = {}): DiscordClient {
  const fetchImpl = options.fetch ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const now = options.now ?? (() => Date.now());
  const ttl = options.cacheTtlMs ?? 300_000;
  const baseUrl = options.baseUrl ?? 'https://discord.com/api/v10';

  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<readonly DiscordGuild[]>>();

  const fetchFresh = async (accessToken: string): Promise<readonly DiscordGuild[]> => {
    const response = await fetchImpl(`${baseUrl}/users/@me/guilds`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      // 429 : fallback sur le cache périmé si on en a un, pour que
      // le dashboard continue à fonctionner pendant qu'une fenêtre
      // de rate limit Discord s'écoule.
      if (response.status === 429) {
        const stale = cache.get(accessToken);
        if (stale) return stale.guilds;
      }
      throw new DependencyFailureError(
        `DiscordClient : /users/@me/guilds a répondu ${response.status}`,
        { metadata: { status: response.status } },
      );
    }
    const body = (await response.json()) as readonly DiscordGuild[];
    cache.set(accessToken, { expiresAt: now() + ttl, guilds: body });
    return body;
  };

  return {
    async fetchUserGuilds(accessToken) {
      const hit = cache.get(accessToken);
      if (hit && hit.expiresAt > now()) {
        return hit.guilds;
      }

      const pending = inFlight.get(accessToken);
      if (pending) return pending;

      const promise = fetchFresh(accessToken).finally(() => {
        inFlight.delete(accessToken);
      });
      inFlight.set(accessToken, promise);
      return promise;
    },

    invalidate(accessToken) {
      if (accessToken === undefined) {
        cache.clear();
        inFlight.clear();
      } else {
        cache.delete(accessToken);
        inFlight.delete(accessToken);
      }
    },
  };
}

/** Filtre les guilds où l'utilisateur a la permission MANAGE_GUILD. */
export function hasManageGuild(permissions: string): boolean {
  try {
    const bits = BigInt(permissions);
    return (bits & PERMISSION_MANAGE_GUILD) === PERMISSION_MANAGE_GUILD;
  } catch {
    return false;
  }
}
