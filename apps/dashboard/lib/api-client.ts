import type { ConfigUi } from '@varde/contracts';
import { cookies } from 'next/headers';

/**
 * Client léger vers `@varde/api` côté server components. L'URL de
 * base vient de `VARDE_API_URL` (défaut `http://localhost:4000` en
 * dev monolith). Le cookie de session `varde.session` est forwardé
 * depuis les headers de la requête entrante — l'API l'interprète via
 * `createJwtAuthenticator` avec le même secret HS256 (ADR 0006).
 *
 * Les fonctions qui lisent des données sont des server components
 * helpers (utilisent `cookies()` de `next/headers`). `saveModuleConfig`
 * est déclarée ici mais appelée côté client via un server action ou
 * une route handler — en V1 on utilise `fetch` direct depuis un
 * composant client, ce qui nécessite que le cookie soit déjà transmis
 * par le navigateur. Voir [`ConfigForm`](../components/ConfigForm.tsx).
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export interface AdminGuildDto {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

export interface ModuleListItemDto {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
}

export interface ModuleConfigDto {
  readonly config: Readonly<Record<string, unknown>>;
  readonly configUi: ConfigUi | null;
  readonly configSchema: unknown;
}

export interface ZodIssueLite {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
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
    readonly code?: string,
    readonly details?: unknown,
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

/** Liste des modules chargés côté core pour une guild (enabled/disabled). */
export async function fetchModules(guildId: string): Promise<readonly ModuleListItemDto[]> {
  return apiGet<readonly ModuleListItemDto[]>(`/guilds/${encodeURIComponent(guildId)}/modules`);
}

/** Config actuelle d'un module + métadonnées de rendu (`configUi`). */
export async function fetchModuleConfig(
  guildId: string,
  moduleId: string,
): Promise<ModuleConfigDto> {
  return apiGet<ModuleConfigDto>(
    `/guilds/${encodeURIComponent(guildId)}/modules/${encodeURIComponent(moduleId)}/config`,
  );
}
