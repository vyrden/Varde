'use server';

import { cookies } from 'next/headers';

import type { AdminDiscordDto } from './admin-api';

/**
 * Server actions de la page `/admin/discord` (jalon 7 PR 7.2
 * sub-livrable 7c). Quatre actions :
 *
 * - `submitAdminDiscordApp` : `PUT /admin/discord/app`
 * - `submitAdminDiscordToken` : `PUT /admin/discord/token`
 * - `submitAdminDiscordOAuth` : `PUT /admin/discord/oauth`
 * - `revealAdminBotToken` : `POST /admin/discord/reveal-token`
 *
 * Chaque action forwarde le cookie `varde.session` et normalise
 * les erreurs API en `{ code, message }`. Le flag `app_id_mismatch`
 * est propagé tel quel — l'UI affiche alors un encart de
 * confirmation et resoumet avec `confirmAppChange: true`.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export type AdminActionState<TData> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success'; readonly data: TData }
  | {
      readonly kind: 'error';
      readonly code: string;
      readonly message: string;
      readonly details?: unknown;
    };

interface ApiErrorBody {
  readonly error?: unknown;
  readonly message?: unknown;
  readonly details?: unknown;
}

const parseError = async (
  res: Response,
): Promise<{ code: string; message: string; details?: unknown }> => {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const code = typeof body?.error === 'string' ? body.error : 'http_error';
  const message = typeof body?.message === 'string' ? body.message : `API a répondu ${res.status}.`;
  return body?.details !== undefined ? { code, message, details: body.details } : { code, message };
};

const buildCookieHeader = async (): Promise<string> => {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

const putJson = async <TData>(path: string, body: unknown): Promise<AdminActionState<TData>> => {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    const data = (await res.json()) as TData;
    return { kind: 'success', data };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

export async function submitAdminDiscordApp(
  _previous: AdminActionState<AdminDiscordDto>,
  formData: FormData,
): Promise<AdminActionState<AdminDiscordDto>> {
  const appId = formData.get('appId');
  const publicKey = formData.get('publicKey');
  if (typeof appId !== 'string' || typeof publicKey !== 'string') {
    return { kind: 'error', code: 'invalid_form', message: 'Champs manquants.' };
  }
  return putJson<AdminDiscordDto>('/admin/discord/app', { appId, publicKey });
}

export async function submitAdminDiscordToken(
  _previous: AdminActionState<AdminDiscordDto>,
  formData: FormData,
): Promise<AdminActionState<AdminDiscordDto>> {
  const token = formData.get('token');
  const confirmAppChange = formData.get('confirmAppChange') === 'true';
  if (typeof token !== 'string' || token.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'Token absent.' };
  }
  return putJson<AdminDiscordDto>(
    '/admin/discord/token',
    confirmAppChange ? { token, confirmAppChange: true } : { token },
  );
}

export async function submitAdminDiscordOAuth(
  _previous: AdminActionState<AdminDiscordDto>,
  formData: FormData,
): Promise<AdminActionState<AdminDiscordDto>> {
  const clientSecret = formData.get('clientSecret');
  if (typeof clientSecret !== 'string' || clientSecret.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'Client Secret absent.' };
  }
  return putJson<AdminDiscordDto>('/admin/discord/oauth', { clientSecret });
}

export interface RevealTokenResponse {
  readonly token: string;
}

export type RevealTokenState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success'; readonly token: string }
  | { readonly kind: 'error'; readonly code: string; readonly message: string };

export async function revealAdminBotToken(_previous: RevealTokenState): Promise<RevealTokenState> {
  try {
    const res = await fetch(`${API_URL}/admin/discord/reveal-token`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify({ confirmation: true }),
    });
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    const body = (await res.json()) as RevealTokenResponse;
    return { kind: 'success', token: body.token };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
