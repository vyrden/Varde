'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { AdminUrlsDto } from './admin-api';

/**
 * Server actions de la page `/admin/urls` (jalon 7 PR 7.2
 * sub-livrable 7d). Trois mutations + revalidation explicite du
 * segment `/admin/urls` après chaque succès — le payload est lu
 * server-side au prochain rendu.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export type AdminActionState<TData> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success'; readonly data: TData }
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

const callJson = async <TData>(
  method: 'PUT' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<AdminActionState<TData>> => {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    const data = (await res.json()) as TData;
    revalidatePath('/admin/urls');
    return { kind: 'success', data };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

export async function submitAdminBaseUrl(
  _previous: AdminActionState<AdminUrlsDto>,
  formData: FormData,
): Promise<AdminActionState<AdminUrlsDto>> {
  const baseUrl = formData.get('baseUrl');
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'URL absente.' };
  }
  return callJson<AdminUrlsDto>('PUT', '/admin/urls/base', { baseUrl });
}

export async function addAdminUrl(
  _previous: AdminActionState<AdminUrlsDto>,
  formData: FormData,
): Promise<AdminActionState<AdminUrlsDto>> {
  const url = formData.get('url');
  const label = formData.get('label');
  if (typeof url !== 'string' || url.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'URL absente.' };
  }
  const body = typeof label === 'string' && label.length > 0 ? { url, label } : { url };
  return callJson<AdminUrlsDto>('POST', '/admin/urls', body);
}

export async function removeAdminUrl(
  _previous: AdminActionState<AdminUrlsDto>,
  formData: FormData,
): Promise<AdminActionState<AdminUrlsDto>> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'Id absent.' };
  }
  return callJson<AdminUrlsDto>('DELETE', `/admin/urls/${encodeURIComponent(id)}`);
}
