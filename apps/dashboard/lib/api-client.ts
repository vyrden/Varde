import { cookies } from 'next/headers';

/**
 * Client léger vers `@varde/api` côté server components. L'URL de
 * base vient de `VARDE_API_URL` (défaut `http://localhost:4000` en
 * dev monolith). Le cookie de session `varde.session` est forwardé
 * depuis les headers de la requête entrante — l'API l'interprète via
 * `createJwtAuthenticator` avec le même secret HS256 (ADR 0006).
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export interface AdminGuildDto {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      cookie: await buildCookieHeader(),
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `API ${path} a répondu ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Liste des guilds administrables par l'utilisateur logué. */
export async function fetchAdminGuilds(): Promise<readonly AdminGuildDto[]> {
  return apiGet<readonly AdminGuildDto[]>('/guilds');
}
