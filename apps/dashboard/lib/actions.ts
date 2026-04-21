'use server';

import { cookies } from 'next/headers';

/**
 * Server actions appelées depuis les composants clients. Le pattern
 * est simple : tout accès sortant à `@varde/api` passe côté serveur
 * Next (on n'ouvre pas de CORS à la pile API + cookies), donc les
 * mutations suivent le même chemin que les lectures — cookie lu via
 * `next/headers`, fetch vers `VARDE_API_URL`, remontée explicite du
 * résultat au client.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export interface SaveModuleConfigResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly details?: ReadonlyArray<{
    readonly path: ReadonlyArray<string | number>;
    readonly message: string;
  }>;
  readonly message?: string;
}

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

/**
 * Persiste une nouvelle valeur de config pour un module sur une guild.
 * Transmet le body tel quel à l'API ; c'est elle qui valide via
 * `configSchema` et renvoie un 400 `invalid_config` avec les issues
 * Zod le cas échéant. Le retour est structuré pour que le formulaire
 * côté client puisse mettre à jour ses erreurs par champ.
 */
export async function saveModuleConfig(
  guildId: string,
  moduleId: string,
  values: Record<string, unknown>,
): Promise<SaveModuleConfigResult> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/${encodeURIComponent(moduleId)}/config`,
    {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify(values),
    },
  );

  if (response.status === 204) return { ok: true };

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const body = (payload ?? {}) as { error?: string; message?: string; details?: unknown };
  const details = Array.isArray(body.details)
    ? (body.details as Array<{ path?: unknown; message?: unknown }>)
        .filter(
          (issue): issue is { path: Array<string | number>; message: string } =>
            Array.isArray(issue.path) && typeof issue.message === 'string',
        )
        .map((issue) => ({ path: issue.path, message: issue.message }))
    : undefined;

  return {
    ok: false,
    status: response.status,
    ...(body.error ? { code: body.error } : {}),
    ...(details ? { details } : {}),
    ...(body.message ? { message: body.message } : {}),
  };
}
