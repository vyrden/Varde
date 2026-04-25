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

/** Définition d'une permission telle qu'exposée dans le manifeste d'un module. */
export interface PermissionDefinitionDto {
  readonly id: string;
  readonly category: string;
  readonly defaultLevel: 'admin' | 'moderator' | 'member' | 'nobody';
  readonly description: string;
}

export interface ModuleListItemDto {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  /** Permissions déclarées dans le manifeste du module. */
  readonly permissions: readonly PermissionDefinitionDto[];
}

export interface ModuleConfigDto {
  readonly config: Readonly<Record<string, unknown>>;
  readonly configUi: ConfigUi | null;
  readonly configSchema: unknown;
}

export type AuditActorType = 'user' | 'system' | 'module';
export type AuditSeverity = 'info' | 'warn' | 'error';

export interface AuditLogItemDto {
  readonly id: string;
  readonly guildId: string;
  readonly actorType: AuditActorType;
  readonly actorId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly moduleId: string | null;
  readonly severity: AuditSeverity;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface AuditPageDto {
  readonly items: readonly AuditLogItemDto[];
  readonly nextCursor?: string;
}

export interface AuditFilters {
  readonly action?: string;
  readonly actorType?: AuditActorType;
  readonly severity?: AuditSeverity;
  readonly since?: string;
  readonly until?: string;
  readonly cursor?: string;
  readonly limit?: number;
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

/**
 * Une page d'audit log pour une guild. Les filtres sont tous optionnels ;
 * `cursor` (ULID de la dernière ligne vue) permet de charger la page
 * suivante. L'API borne `limit` à [1, 100] (défaut 50).
 */
export async function fetchAudit(
  guildId: string,
  filters: AuditFilters = {},
): Promise<AuditPageDto> {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.actorType) params.set('actorType', filters.actorType);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.since) params.set('since', filters.since);
  if (filters.until) params.set('until', filters.until);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  const query = params.toString();
  const suffix = query.length > 0 ? `?${query}` : '';
  return apiGet<AuditPageDto>(`/guilds/${encodeURIComponent(guildId)}/audit${suffix}`);
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

/** Permission déclarée par un module mais non encore liée à un rôle guild. */
export interface UnboundPermission {
  readonly id: string;
  readonly description: string;
  readonly category: string;
  readonly defaultLevel: 'admin' | 'moderator' | 'member' | 'nobody';
}

/** Liste des permissions non liées déclarées par un module pour une guild. */
export async function fetchUnboundPermissions(
  guildId: string,
  moduleId: string,
): Promise<readonly UnboundPermission[]> {
  const body = await apiGet<{ permissions: UnboundPermission[] }>(
    `/guilds/${encodeURIComponent(guildId)}/modules/${encodeURIComponent(moduleId)}/unbound-permissions`,
  );
  return body.permissions;
}

/** Route Discord cassée exposée par le module logs. */
export interface LogsBrokenRoute {
  readonly routeId: string;
  readonly channelId: string;
  readonly droppedCount: number;
  readonly bufferedCount: number;
  readonly markedAt: string | null;
  readonly reason: string;
}

/** Liste des routes Discord cassées pour une guild (module logs). */
export async function fetchLogsBrokenRoutes(guildId: string): Promise<readonly LogsBrokenRoute[]> {
  const body = await apiGet<{ routes: LogsBrokenRoute[] }>(
    `/guilds/${encodeURIComponent(guildId)}/modules/logs/broken-routes`,
  );
  return body.routes;
}

/** Salon texte Discord retourné par la liste (GET /discord/text-channels). */
export interface GuildTextChannelDto {
  readonly id: string;
  readonly name: string;
}

/** Rôle Discord retourné par la liste (GET /discord/roles). */
export interface GuildRoleDto {
  readonly id: string;
  readonly name: string;
}

/**
 * Liste les salons texte Discord d'une guild. Retourne un tableau vide
 * si le bot n'est pas connecté (503 bridge indisponible est silencé).
 */
export async function fetchGuildTextChannels(
  guildId: string,
): Promise<readonly GuildTextChannelDto[]> {
  try {
    const body = await apiGet<{ channels: GuildTextChannelDto[] }>(
      `/guilds/${encodeURIComponent(guildId)}/discord/text-channels`,
    );
    return body.channels;
  } catch (error) {
    // 503 = bot non connecté : on retourne une liste vide plutôt que de
    // faire sauter toute la page.
    if (error instanceof ApiError && error.status === 503) return [];
    throw error;
  }
}

/**
 * Liste les rôles Discord d'une guild. Retourne un tableau vide si le
 * bot n'est pas connecté (503 bridge indisponible est silencé).
 */
export async function fetchGuildRoles(guildId: string): Promise<readonly GuildRoleDto[]> {
  try {
    const body = await apiGet<{ roles: GuildRoleDto[] }>(
      `/guilds/${encodeURIComponent(guildId)}/discord/roles`,
    );
    return body.roles;
  } catch (error) {
    // 503 = bot non connecté : on retourne une liste vide plutôt que de
    // faire sauter toute la page.
    if (error instanceof ApiError && error.status === 503) return [];
    throw error;
  }
}

/** Emoji custom Discord retourné par GET /discord/emojis. */
export interface GuildEmojiDto {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
  /** Présent uniquement pour les emojis externes (autres serveurs). */
  readonly guildName?: string;
}

/** Réponse de GET /discord/emojis : emojis serveur courant + autres serveurs. */
export interface GuildEmojisResponse {
  readonly current: readonly GuildEmojiDto[];
  readonly external: readonly GuildEmojiDto[];
}

/**
 * Liste les emojis custom visibles depuis une guild (serveur courant +
 * autres serveurs où le bot est invité). Retourne `{ current: [],
 * external: [] }` si le bot n'est pas connecté.
 */
export async function fetchGuildEmojis(guildId: string): Promise<GuildEmojisResponse> {
  try {
    return await apiGet<GuildEmojisResponse>(
      `/guilds/${encodeURIComponent(guildId)}/discord/emojis`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return { current: [], external: [] };
    }
    throw error;
  }
}

/** Binding permission → rôle tel que renvoyé par l'API. */
export interface PermissionBindingDto {
  readonly permissionId: string;
  readonly roleId: string;
}

/**
 * Liste tous les bindings permission → rôle actifs pour une guild.
 * Utilisé par la page `settings/permissions` pour initialiser l'état
 * de l'éditeur sans appel réseau supplémentaire côté client.
 */
export async function fetchPermissionBindings(
  guildId: string,
): Promise<readonly PermissionBindingDto[]> {
  const body = await apiGet<{ bindings: PermissionBindingDto[] }>(
    `/guilds/${encodeURIComponent(guildId)}/permissions/bindings`,
  );
  return body.bindings;
}
