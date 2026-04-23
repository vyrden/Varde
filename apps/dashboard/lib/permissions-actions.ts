'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/**
 * Server actions pour la page settings/permissions. Les mutations
 * passent côté serveur (cookie forwarded vers l'API Fastify) et
 * invalident la page après chaque opération réussie.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export interface PermissionActionResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly error?: string;
}

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.message ?? body.error ?? `Erreur ${response.status}`;
  } catch {
    return `Erreur ${response.status}`;
  }
};

/**
 * Lie un rôle Discord à une permission déclarée par un module.
 * Appelle `POST /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings`.
 */
export async function bindPermission(
  guildId: string,
  moduleId: string,
  permissionId: string,
  roleId: string,
): Promise<PermissionActionResult> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/${encodeURIComponent(moduleId)}/permissions/${encodeURIComponent(permissionId)}/bindings`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify({ roleId }),
    },
  );
  if (response.status === 204) {
    revalidatePath(`/guilds/${guildId}/settings/permissions`);
    return { ok: true };
  }
  const error = await parseError(response);
  return { ok: false, status: response.status, error };
}

/**
 * Supprime le binding entre un rôle Discord et une permission de module.
 * Appelle `DELETE /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings/:roleId`.
 */
export async function unbindPermission(
  guildId: string,
  moduleId: string,
  permissionId: string,
  roleId: string,
): Promise<PermissionActionResult> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/${encodeURIComponent(moduleId)}/permissions/${encodeURIComponent(permissionId)}/bindings/${encodeURIComponent(roleId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
    },
  );
  if (response.status === 204) {
    revalidatePath(`/guilds/${guildId}/settings/permissions`);
    return { ok: true };
  }
  const error = await parseError(response);
  return { ok: false, status: response.status, error };
}
