import { cookies } from 'next/headers';

/**
 * Client typé vers `/admin/*` côté server components (jalon 7 PR
 * 7.2 sub-livrable 7). Forwarde le cookie de session `varde.session`
 * que l'API décode via le même secret HS256.
 *
 * Toutes les fonctions retournent des données ou throw `AdminApiError`
 * — l'appelant (layout admin) catch et appelle `notFound()` quand il
 * voit un 401/404, pour matérialiser le « 404 ne révèle pas
 * l'existence de la zone admin » exigé par le spec.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

const apiGet = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      cookie: await buildCookieHeader(),
    },
  });
  if (!response.ok) {
    throw new AdminApiError(response.status, `API ${path} a répondu ${response.status}`);
  }
  return (await response.json()) as T;
};

export interface AdminOverviewDto {
  readonly bot: {
    readonly connected: boolean;
    readonly latencyMs: number | null;
    readonly uptime: number;
    readonly version: string;
  };
  readonly guilds: {
    readonly count: number;
    readonly totalMembers: number | null;
  };
  readonly modules: {
    readonly installed: number;
    readonly active: number;
  };
  readonly db: {
    readonly driver: 'pg' | 'sqlite';
    readonly sizeBytes: number | null;
    readonly lastMigration: string | null;
  };
}

export const fetchAdminOverview = (): Promise<AdminOverviewDto> =>
  apiGet<AdminOverviewDto>('/admin/overview');
