/**
 * Client serveur pour les routes du wizard de setup (jalon 7 PR 7.1
 * sous-livrable 5). Pendant que `setup_completed_at` est null, ces
 * routes sont publiques côté API — pas besoin de cookie de session.
 *
 * Le module expose un `SetupFetch` injectable pour rendre les
 * helpers testables sans réseau. La prod utilise `globalThis.fetch`.
 */

/** Type minimal de fetch accepté pour permettre l'injection. */
export type SetupFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Forme d'un check tel que retourné par l'API. */
export interface SystemCheckResult {
  readonly name: 'database' | 'master_key' | 'discord_connectivity';
  readonly ok: boolean;
  readonly detail?: string;
}

/** Réponse complète de `POST /setup/system-check`. */
export interface SystemCheckPayload {
  readonly checks: readonly SystemCheckResult[];
  readonly detectedBaseUrl: string;
}

/** Réponse de `POST /setup/discord-app`. */
export interface DiscordAppResponse {
  readonly appName: string;
}

/** Nom canonique d'un intent privilégié Discord. */
export type PrivilegedIntentName = 'PRESENCE' | 'GUILD_MEMBERS' | 'MESSAGE_CONTENT';

/** DTO bot user retourné par `POST /setup/bot-token`. */
export interface BotUserDto {
  readonly id: string;
  readonly username: string;
  readonly discriminator?: string;
  readonly avatar?: string | null;
}

/** Réponse de `POST /setup/bot-token` (union discriminée par `valid`). */
export type BotTokenResponse =
  | {
      readonly valid: true;
      readonly botUser: BotUserDto;
      readonly missingIntents: readonly PrivilegedIntentName[];
    }
  | { readonly valid: false; readonly reason: 'invalid_token' };

/** Réponse de `POST /setup/oauth`. */
export type OAuthResponse =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: 'invalid_secret' };

/** Réponse de `POST /setup/identity`. */
export interface IdentityResponse {
  readonly name: string | null;
  readonly description: string | null;
  readonly avatarUrl: string | null;
}

/** Réponse de `POST /setup/complete`. */
export type CompleteResponse =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'timeout' };

/**
 * Résultat ergonomique côté UI — discrimine succès / échec d'appel
 * (un échec API n'est pas la même chose qu'un check qui rapporte
 * `ok: false`).
 */
export type SystemCheckResponse =
  | {
      readonly ok: true;
      readonly checks: readonly SystemCheckResult[];
      readonly detectedBaseUrl: string;
    }
  | { readonly ok: false; readonly status: number | null; readonly message: string };

/**
 * Appelle `POST /setup/system-check`. Sémantique :
 * - 200 → `{ ok: true, ... }` avec les trois checks et l'URL.
 * - autre code → `{ ok: false, status, message }`.
 * - throw fetch → `{ ok: false, status: null, message }`.
 *
 * `cache: 'no-store'` parce qu'on veut les vérifs lancées à chaque
 * affichage de la page (un retry après diagnostic doit voir l'état
 * réel, pas une réponse mémorisée).
 */
export async function runSystemCheck(
  apiUrl: string,
  fetchImpl: SetupFetch,
): Promise<SystemCheckResponse> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/setup/system-check`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    return {
      ok: false,
      status: null,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: `API a répondu ${response.status} sur /setup/system-check.`,
    };
  }
  let body: SystemCheckPayload;
  try {
    body = (await response.json()) as SystemCheckPayload;
  } catch (err) {
    return {
      ok: false,
      status: response.status,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  return { ok: true, checks: body.checks, detectedBaseUrl: body.detectedBaseUrl };
}
