'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { GuildPermissionsConfigDto, GuildPermissionsPreviewDto } from './api-client';

/**
 * Server actions de la page `/guilds/:guildId/permissions` (jalon
 * 7 PR 7.3 sub-livrable 8). Forwarde le cookie de session
 * `varde.session` pour que `requireGuildAccess('admin')` côté API
 * accepte la requête.
 *
 * Trois actions :
 *
 * - `saveGuildPermissions` (PUT) : persiste la config + invalide
 *   le segment `/guilds/:guildId/permissions`.
 * - `previewGuildPermissions` (POST /preview) : retourne les
 *   membres qui auraient accès à chaque niveau, sans persister.
 *
 * Les codes d'erreur métier (`unknown_role_ids`, `invalid_permissions`,
 * etc.) sont propagés via le state `error.code`. La traduction des
 * messages se fait côté client à partir d'un dictionnaire `errors`
 * indexé par code (cf. pattern `admin-identity-actions`).
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export type GuildPermissionsActionState<TData> =
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

const parseRoleIds = (formData: FormData, key: string): string[] => {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw.split(',').filter((id) => id.length > 0);
};

export async function saveGuildPermissions(
  _previous: GuildPermissionsActionState<GuildPermissionsConfigDto>,
  formData: FormData,
): Promise<GuildPermissionsActionState<GuildPermissionsConfigDto>> {
  const guildId = formData.get('guildId');
  if (typeof guildId !== 'string' || guildId.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'guildId absent.' };
  }
  const adminRoleIds = parseRoleIds(formData, 'adminRoleIds');
  const moderatorRoleIds = parseRoleIds(formData, 'moderatorRoleIds');
  try {
    const res = await fetch(`${API_URL}/guilds/${encodeURIComponent(guildId)}/permissions`, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify({ adminRoleIds, moderatorRoleIds }),
    });
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    const data = (await res.json()) as GuildPermissionsConfigDto;
    revalidatePath(`/guilds/${guildId}/permissions`);
    return { kind: 'success', data };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function previewGuildPermissions(
  _previous: GuildPermissionsActionState<GuildPermissionsPreviewDto>,
  formData: FormData,
): Promise<GuildPermissionsActionState<GuildPermissionsPreviewDto>> {
  const guildId = formData.get('guildId');
  if (typeof guildId !== 'string' || guildId.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'guildId absent.' };
  }
  const adminRoleIds = parseRoleIds(formData, 'adminRoleIds');
  const moderatorRoleIds = parseRoleIds(formData, 'moderatorRoleIds');
  try {
    const res = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/permissions/preview`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify({ adminRoleIds, moderatorRoleIds }),
      },
    );
    if (!res.ok) {
      return { kind: 'error', ...(await parseError(res)) };
    }
    const data = (await res.json()) as GuildPermissionsPreviewDto;
    return { kind: 'success', data };
  } catch (err) {
    return {
      kind: 'error',
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
