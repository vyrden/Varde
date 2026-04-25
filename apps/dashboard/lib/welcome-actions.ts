'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

// biome-ignore lint/complexity/useLiteralKeys: noUncheckedIndexedAccess requires bracket notation for process.env
const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

/** Miroir client du schéma `welcomeConfigSchema` côté module. */
export interface WelcomeConfigClient {
  readonly version: 1;
  readonly welcome: {
    readonly enabled: boolean;
    readonly destination: 'channel' | 'dm' | 'both';
    readonly channelId: string | null;
    readonly message: string;
    readonly embed: { readonly enabled: boolean; readonly color: string };
    readonly card: { readonly enabled: boolean; readonly backgroundColor: string };
  };
  readonly goodbye: {
    readonly enabled: boolean;
    readonly channelId: string | null;
    readonly message: string;
    readonly embed: { readonly enabled: boolean; readonly color: string };
    readonly card: { readonly enabled: boolean; readonly backgroundColor: string };
  };
  readonly autorole: {
    readonly enabled: boolean;
    readonly roleIds: readonly string[];
    readonly delaySeconds: number;
  };
  readonly accountAgeFilter: {
    readonly enabled: boolean;
    readonly minDays: number;
    readonly action: 'kick' | 'quarantine';
    readonly quarantineRoleId: string | null;
  };
}

export type SaveResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }>;
    };

/**
 * Persiste la config welcome via `PUT /guilds/:guildId/modules/welcome/config`.
 * La validation Zod est déléguée à l'API.
 */
export async function saveWelcomeConfig(
  guildId: string,
  config: WelcomeConfigClient,
): Promise<SaveResult> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/welcome/config`,
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
      revalidatePath(`/guilds/${guildId}/modules/welcome`);
      return { ok: true };
    }

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

export type PreviewCardResult =
  | { readonly ok: true; readonly dataUrl: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Génère une preview de la carte d'accueil. L'API renvoie du PNG brut ;
 * on le ré-encode en data URL pour pouvoir l'afficher dans un <img>
 * côté client sans devoir exposer un endpoint anonyme.
 */
export async function previewWelcomeCard(
  guildId: string,
  body: {
    readonly title: string;
    readonly subtitle: string;
    readonly backgroundColor: string;
    readonly avatarUrl?: string;
  },
): Promise<PreviewCardResult> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/welcome/preview-card`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'image/png',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return { ok: false, reason: `http-${response.status}` };
    }
    const buf = Buffer.from(await response.arrayBuffer());
    return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'network',
    };
  }
}

export type TestWelcomeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Envoie un message d'accueil de test via le brouillon de config courant.
 * L'admin connecté joue le rôle du nouveau membre fictif.
 */
export async function testWelcome(
  guildId: string,
  draft: WelcomeConfigClient,
): Promise<TestWelcomeResult> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/welcome/test-welcome`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify({ draft }),
      },
    );
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => ({}))) as { reason?: string };
    return { ok: false, reason: body.reason ?? `http-${response.status}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'network' };
  }
}
