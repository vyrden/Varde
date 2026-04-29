'use server';

import { cookies } from 'next/headers';

import type { AdminIdentityDto } from './admin-api';

/**
 * Server actions de la page `/admin/identity` (jalon 7 PR 7.2
 * sub-livrable 7b). Forwarde le cookie `varde.session` à l'API
 * Fastify pour que `requireOwner` accepte la requête.
 *
 * Construit un body partiel : seuls les champs réellement modifiés
 * sont envoyés. Un PUT vide est un no-op explicite côté API
 * (retourne l'état actuel sans appel Discord).
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
      readonly retryAfterMs?: number;
    };

interface ApiErrorBody {
  readonly error?: unknown;
  readonly message?: unknown;
  readonly retryAfterMs?: unknown;
}

const parseError = async (
  res: Response,
): Promise<{ code: string; message: string; retryAfterMs?: number }> => {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const code = typeof body?.error === 'string' ? body.error : 'http_error';
  const message = typeof body?.message === 'string' ? body.message : `API a répondu ${res.status}.`;
  const retryAfterMs = typeof body?.retryAfterMs === 'number' ? body.retryAfterMs : undefined;
  return retryAfterMs !== undefined ? { code, message, retryAfterMs } : { code, message };
};

const buildCookieHeader = async (): Promise<string> => {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

interface IdentityPatch {
  name?: string;
  avatar?: string;
  description?: string;
}

/**
 * Action `submitAdminIdentity` : envoie un PATCH partiel à l'API.
 * Les champs vides côté formulaire sont **omis** du body — pas
 * écrasés en `null`. La sémantique « effacer » n'est pas exposée
 * dans cette PR (Discord ne propose pas un effacement de champ
 * via PATCH /applications/@me).
 */
export async function submitAdminIdentity(
  _previous: AdminActionState<AdminIdentityDto>,
  formData: FormData,
): Promise<AdminActionState<AdminIdentityDto>> {
  const name = formData.get('name');
  const avatar = formData.get('avatar');
  const description = formData.get('description');
  const initialName = formData.get('initialName');
  const initialDescription = formData.get('initialDescription');

  const patch: IdentityPatch = {};
  if (typeof name === 'string' && name.length > 0 && name !== initialName) {
    patch.name = name;
  }
  if (typeof avatar === 'string' && avatar.length > 0) {
    patch.avatar = avatar;
  }
  if (
    typeof description === 'string' &&
    description.length > 0 &&
    description !== initialDescription
  ) {
    patch.description = description;
  }

  try {
    const res = await fetch(`${API_URL}/admin/identity`, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    const data = (await res.json()) as AdminIdentityDto;
    return { kind: 'success', data };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
