'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/**
 * Server actions de la page `/admin/ownership` (jalon 7 PR 7.2
 * sub-livrable 7e). Deux mutations + revalidation explicite du
 * segment.
 *
 * `addAdminOwner` valide via Discord côté API (`GET /users/{id}`
 * avec le token bot) avant persistance — un ID inconnu retourne
 * `404 user_not_found`.
 *
 * `removeAdminOwner` refuse de retirer le dernier owner avec un
 * `409 last_owner` — l'UI cache le bouton dans ce cas, mais on
 * compte aussi sur la garde côté API.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export type AdminActionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly code: string; readonly message: string };

interface ApiErrorBody {
  readonly error?: unknown;
  readonly message?: unknown;
}

const parseError = async (res: Response): Promise<{ code: string; message: string }> => {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const code = typeof body?.error === 'string' ? body.error : 'http_error';
  const message = typeof body?.message === 'string' ? body.message : `API a répondu ${res.status}.`;
  return { code, message };
};

const buildCookieHeader = async (): Promise<string> => {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export async function addAdminOwner(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const discordUserId = formData.get('discordUserId');
  if (typeof discordUserId !== 'string' || discordUserId.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'Discord User ID absent.' };
  }
  try {
    const res = await fetch(`${API_URL}/admin/ownership`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify({ discordUserId }),
    });
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    revalidatePath('/admin/ownership');
    return { kind: 'success' };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function removeAdminOwner(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const discordUserId = formData.get('discordUserId');
  if (typeof discordUserId !== 'string' || discordUserId.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'Discord User ID absent.' };
  }
  try {
    const res = await fetch(`${API_URL}/admin/ownership/${encodeURIComponent(discordUserId)}`, {
      method: 'DELETE',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
    });
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    revalidatePath('/admin/ownership');
    return { kind: 'success' };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
