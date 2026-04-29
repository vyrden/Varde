'use server';

import type {
  BotTokenResponse,
  CompleteResponse,
  DiscordAppResponse,
  IdentityResponse,
  OAuthResponse,
} from './setup-client';

/**
 * Server actions du wizard de setup (jalon 7 PR 7.1, sous-livrable 5).
 *
 * Chaque action est un point d'entrée appelable depuis un formulaire
 * client (`<form action={action}>`) ou via `startTransition`. Elle :
 *
 * 1. Sérialise le body attendu par l'API,
 * 2. Forward l'appel à l'API Fastify (`VARDE_API_URL`),
 * 3. Retourne une union discriminée qui distingue succès, erreur de
 *    validation/protocol (4xx), erreur réseau / 5xx, et statut
 *    "expected" (token invalide, secret invalide).
 *
 * Pas de cookie de session — les routes du wizard sont publiques tant
 * que `setup_completed_at` n'est pas posé. Les server actions tournent
 * dans le worker Next.js, donc l'origine du fetch est interne au
 * cluster (pas de CORS).
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';

/**
 * État de réussite/échec normalisé renvoyé par les actions du
 * wizard. `kind: 'success'` enveloppe la donnée renvoyée par l'API.
 * `kind: 'error'` porte un code et un message lisible côté UI.
 */
export type SetupActionState<TData> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success'; readonly data: TData }
  | {
      readonly kind: 'error';
      readonly code: string;
      readonly message: string;
      readonly details?: unknown;
    };

const idle = <T>(): SetupActionState<T> => ({ kind: 'idle' });

const httpError = async (
  res: Response,
): Promise<{ code: string; message: string; details?: unknown }> => {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (
    body !== null &&
    typeof body === 'object' &&
    'error' in (body as Record<string, unknown>) &&
    typeof (body as { error?: unknown }).error === 'string'
  ) {
    const typed = body as { error: string; message?: string; details?: unknown };
    return {
      code: typed.error,
      message: typed.message ?? typed.error,
      ...(typed.details !== undefined ? { details: typed.details } : {}),
    };
  }
  return {
    code: 'http_error',
    message: `API a répondu ${res.status}.`,
  };
};

const networkError = (err: unknown): { code: string; message: string } => ({
  code: 'network_error',
  message: err instanceof Error ? err.message : String(err),
});

/** État initial des actions — utile au consommateur pour `useActionState`. */
export async function initialActionState<T>(): Promise<SetupActionState<T>> {
  return idle<T>();
}

/**
 * Validation Application ID + Public Key Discord. Côté API :
 * `GET /applications/{id}/rpc` (endpoint public RPC, sans auth).
 */
export async function submitDiscordApp(
  _previous: SetupActionState<DiscordAppResponse>,
  formData: FormData,
): Promise<SetupActionState<DiscordAppResponse>> {
  const appId = formData.get('appId');
  const publicKey = formData.get('publicKey');
  if (typeof appId !== 'string' || typeof publicKey !== 'string') {
    return { kind: 'error', code: 'invalid_form', message: 'Champs manquants.' };
  }
  try {
    const res = await fetch(`${API_URL}/setup/discord-app`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ appId, publicKey }),
      cache: 'no-store',
    });
    if (!res.ok) {
      return { kind: 'error', ...(await httpError(res)) };
    }
    const data = (await res.json()) as DiscordAppResponse;
    return { kind: 'success', data };
  } catch (err) {
    return { kind: 'error', ...networkError(err) };
  }
}

/**
 * Validation token bot + détection des intents privilégiés
 * manquants. Côté API : `GET /users/@me` puis lecture des flags via
 * `GET /applications/@me`.
 */
export async function submitBotToken(
  _previous: SetupActionState<BotTokenResponse>,
  formData: FormData,
): Promise<SetupActionState<BotTokenResponse>> {
  const token = formData.get('token');
  if (typeof token !== 'string' || token.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'Token manquant.' };
  }
  try {
    const res = await fetch(`${API_URL}/setup/bot-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    if (!res.ok) {
      return { kind: 'error', ...(await httpError(res)) };
    }
    const data = (await res.json()) as BotTokenResponse;
    return { kind: 'success', data };
  } catch (err) {
    return { kind: 'error', ...networkError(err) };
  }
}

/** Validation OAuth client secret. Côté API : `POST /oauth2/token`. */
export async function submitOAuth(
  _previous: SetupActionState<OAuthResponse>,
  formData: FormData,
): Promise<SetupActionState<OAuthResponse>> {
  const clientSecret = formData.get('clientSecret');
  if (typeof clientSecret !== 'string' || clientSecret.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'Client secret manquant.' };
  }
  try {
    const res = await fetch(`${API_URL}/setup/oauth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ clientSecret }),
      cache: 'no-store',
    });
    if (!res.ok) {
      return { kind: 'error', ...(await httpError(res)) };
    }
    const data = (await res.json()) as OAuthResponse;
    return { kind: 'success', data };
  } catch (err) {
    return { kind: 'error', ...networkError(err) };
  }
}

/** PATCH partial sur l'identité du bot. */
export async function submitIdentity(
  _previous: SetupActionState<IdentityResponse>,
  formData: FormData,
): Promise<SetupActionState<IdentityResponse>> {
  const name = formData.get('name');
  const description = formData.get('description');
  const avatar = formData.get('avatar');
  const body: Record<string, string> = {};
  if (typeof name === 'string' && name.length > 0) body['name'] = name;
  if (typeof description === 'string') body['description'] = description;
  if (typeof avatar === 'string' && avatar.length > 0) body['avatar'] = avatar;
  try {
    const res = await fetch(`${API_URL}/setup/identity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) {
      return { kind: 'error', ...(await httpError(res)) };
    }
    const data = (await res.json()) as IdentityResponse;
    return { kind: 'success', data };
  } catch (err) {
    return { kind: 'error', ...networkError(err) };
  }
}

/** Finalisation du wizard. Le timeout côté API est de 30 s. */
export async function submitComplete(
  _previous: SetupActionState<CompleteResponse>,
): Promise<SetupActionState<CompleteResponse>> {
  try {
    const res = await fetch(`${API_URL}/setup/complete`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { kind: 'error', ...(await httpError(res)) };
    }
    const data = (await res.json()) as CompleteResponse;
    return { kind: 'success', data };
  } catch (err) {
    return { kind: 'error', ...networkError(err) };
  }
}
