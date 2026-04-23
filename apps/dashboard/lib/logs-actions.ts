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
