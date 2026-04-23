'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

/** Config logs côté client (miroir du schéma Zod dans modules/logs). */
export interface LogsConfigClient {
  readonly version: 1;
  readonly routes: readonly {
    readonly id: string;
    readonly label: string;
    readonly events: readonly string[];
    readonly channelId: string;
    readonly verbosity: 'compact' | 'detailed';
  }[];
  readonly exclusions: {
    readonly userIds: readonly string[];
    readonly roleIds: readonly string[];
    readonly channelIds: readonly string[];
    readonly excludeBots: boolean;
  };
}

export interface TestLogsRouteResult {
  readonly ok: true;
}

export interface TestLogsRouteError {
  readonly ok: false;
  readonly reason: 'channel-not-found' | 'missing-permission' | 'rate-limit-exhausted' | 'unknown';
}

export interface SaveLogsConfigResult {
  readonly ok: true;
}

export interface SaveLogsConfigError {
  readonly ok: false;
  readonly issues: readonly { readonly path: string; readonly message: string }[];
}

/**
 * Valide et persiste la config logs pour une guild via
 * `PUT /guilds/:guildId/modules/logs/config`. La validation Zod est
 * déléguée à l'API (qui utilise le configSchema du module logs).
 * Les erreurs de validation remontent sous forme d'issues structurées.
 */
export async function saveLogsConfig(
  guildId: string,
  config: LogsConfigClient,
): Promise<SaveLogsConfigResult | SaveLogsConfigError> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/logs/config`,
      {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify(config),
      },
    );

    if (response.status === 204 || response.ok) {
      revalidatePath(`/guilds/${guildId}/modules/logs`);
      return { ok: true };
    }

    /* L'API renvoie { message, details? } sur les erreurs de validation */
    let issues: { path: string; message: string }[] = [];
    try {
      const body = (await response.json()) as {
        message?: string;
        details?: Array<{ path?: unknown; message?: string }>;
      };
      if (Array.isArray(body.details) && body.details.length > 0) {
        issues = body.details.map((d) => ({
          path: Array.isArray(d.path) ? d.path.join('.') : String(d.path ?? ''),
          message: d.message ?? 'Erreur inconnue',
        }));
      } else {
        issues = [{ path: '', message: body.message ?? `Erreur HTTP ${response.status}` }];
      }
    } catch {
      issues = [{ path: '', message: `Erreur HTTP ${response.status}` }];
    }

    return { ok: false, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, issues: [{ path: '', message }] };
  }
}

export interface CreateLogsChannelResult {
  readonly ok: true;
  readonly channelId: string;
  readonly channelName: string;
}

export interface CreateLogsChannelError {
  readonly ok: false;
  readonly reason: 'permission-denied' | 'quota-exceeded' | 'discord-unavailable' | 'unknown';
}

/** Raisons typées retournées par l'API /discord/channels. */
const KNOWN_CREATE_REASONS = new Set([
  'permission-denied',
  'quota-exceeded',
  'discord-unavailable',
] as const);

type KnownCreateReason = 'permission-denied' | 'quota-exceeded' | 'discord-unavailable';

/** Extrait un reason typé depuis le body d'erreur de l'API (création salon). */
function extractCreateReason(body: unknown): CreateLogsChannelError['reason'] {
  if (
    body !== null &&
    typeof body === 'object' &&
    'reason' in body &&
    typeof (body as { reason: unknown }).reason === 'string' &&
    KNOWN_CREATE_REASONS.has((body as { reason: KnownCreateReason }).reason)
  ) {
    return (body as { reason: KnownCreateReason }).reason;
  }
  return 'unknown';
}

/**
 * Crée un salon #logs dans la guild cible via l'API.
 * Utilisé par le bouton "Créer #logs pour moi" du mode simple.
 */
export async function createLogsChannel(
  guildId: string,
): Promise<CreateLogsChannelResult | CreateLogsChannelError> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/discord/channels`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify({
          name: 'logs',
          type: 'text',
          topic: "Journal d'activité Varde",
        }),
      },
    );

    if (response.ok) {
      const body = (await response.json()) as { channelId: string; channelName: string };
      return { ok: true, channelId: body.channelId, channelName: body.channelName };
    }

    if (response.status === 503) {
      return { ok: false, reason: 'discord-unavailable' };
    }

    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      /* réponse non-JSON */
    }

    return { ok: false, reason: extractCreateReason(errorBody) };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}

/** Raisons typées retournées par l'API /test-route. */
const KNOWN_REASONS = new Set([
  'channel-not-found',
  'missing-permission',
  'rate-limit-exhausted',
] as const);

type KnownReason = 'channel-not-found' | 'missing-permission' | 'rate-limit-exhausted';

/** Extrait un reason typé depuis le body d'erreur de l'API. */
function extractReason(body: unknown): TestLogsRouteError['reason'] {
  if (
    body !== null &&
    typeof body === 'object' &&
    'reason' in body &&
    typeof (body as { reason: unknown }).reason === 'string' &&
    KNOWN_REASONS.has((body as { reason: KnownReason }).reason)
  ) {
    return (body as { reason: KnownReason }).reason;
  }
  return 'unknown';
}

/**
 * Envoie un embed factice dans le salon cible pour valider qu'une
 * route fonctionne. Retourne ok=true si Discord a accepté l'envoi,
 * ou ok=false + reason pour les échecs typés.
 */
export async function testLogsRoute(
  guildId: string,
  channelId: string,
): Promise<TestLogsRouteResult | TestLogsRouteError> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/logs/test-route`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify({ channelId }),
      },
    );

    if (response.ok) {
      return { ok: true };
    }

    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      /* réponse non-JSON : reason 'unknown' */
    }

    return { ok: false, reason: extractReason(errorBody) };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}
