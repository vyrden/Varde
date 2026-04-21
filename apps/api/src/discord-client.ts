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
 * (`/users/@me/guilds`) avec cache TTL par access_token pour
 * amortir les appels répétés du dashboard et respecter le rate
 * limit Discord (50 req/s global par default, plus souple par bucket).
 *
 * Le fetch est injectable pour que les tests puissent fournir un
 * double ; production utilise `globalThis.fetch`.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CreateDiscordClientOptions {
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  /** TTL du cache en ms. Défaut : 60 000 (60 s). */
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
  const ttl = options.cacheTtlMs ?? 60_000;
  const baseUrl = options.baseUrl ?? 'https://discord.com/api/v10';

  const cache = new Map<string, CacheEntry>();

  return {
    async fetchUserGuilds(accessToken) {
      const currentTime = now();
      const hit = cache.get(accessToken);
      if (hit && hit.expiresAt > currentTime) {
        return hit.guilds;
      }

      const response = await fetchImpl(`${baseUrl}/users/@me/guilds`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new DependencyFailureError(
          `DiscordClient : /users/@me/guilds a répondu ${response.status}`,
          { metadata: { status: response.status } },
        );
      }
      const body = (await response.json()) as readonly DiscordGuild[];
      const entry: CacheEntry = {
        expiresAt: currentTime + ttl,
        guilds: body,
      };
      cache.set(accessToken, entry);
      return body;
    },

    invalidate(accessToken) {
      if (accessToken === undefined) {
        cache.clear();
      } else {
        cache.delete(accessToken);
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
