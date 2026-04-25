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
    readonly card: {
      readonly enabled: boolean;
      readonly backgroundColor: string;
      readonly backgroundImagePath: string | null;
      readonly text: {
        readonly titleFontSize: number;
        readonly subtitleFontSize: number;
        readonly fontFamily: 'sans-serif' | 'serif' | 'monospace';
      };
    };
  };
  readonly goodbye: {
    readonly enabled: boolean;
    readonly channelId: string | null;
    readonly message: string;
    readonly embed: { readonly enabled: boolean; readonly color: string };
    readonly card: {
      readonly enabled: boolean;
      readonly backgroundColor: string;
      readonly backgroundImagePath: string | null;
      readonly text: {
        readonly titleFontSize: number;
        readonly subtitleFontSize: number;
        readonly fontFamily: 'sans-serif' | 'serif' | 'monospace';
      };
    };
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
    /** Demande au serveur d'utiliser l'image de fond persistée pour cette cible. */
    readonly backgroundTarget?: 'welcome' | 'goodbye';
    readonly text?: {
      readonly titleFontSize?: number;
      readonly subtitleFontSize?: number;
      readonly fontFamily?: 'sans-serif' | 'serif' | 'monospace';
    };
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

export type UploadBackgroundResult =
  | { readonly ok: true; readonly relativePath: string }
  | { readonly ok: false; readonly reason: string; readonly detail?: string };

/**
 * Persiste une image de fond pour la cible (welcome ou goodbye).
 * Le `dataUrl` est attendu sous la forme `data:image/png;base64,...`
 * — on le passe tel quel au backend qui décode et valide.
 */
export async function uploadWelcomeBackground(
  guildId: string,
  target: 'welcome' | 'goodbye',
  dataUrl: string,
): Promise<UploadBackgroundResult> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/welcome/background?target=${target}`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify({ dataUrl }),
      },
    );
    if (response.ok) {
      const body = (await response.json()) as { relativePath: string };
      revalidatePath(`/guilds/${guildId}/modules/welcome`);
      return { ok: true, relativePath: body.relativePath };
    }
    const errBody = (await response.json().catch(() => ({}))) as {
      reason?: string;
      detail?: string;
    };
    return {
      ok: false,
      reason: errBody.reason ?? `http-${response.status}`,
      ...(errBody.detail !== undefined ? { detail: errBody.detail } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'network',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Supprime l'image de fond persistée pour une cible. Idempotent. */
export async function deleteWelcomeBackground(
  guildId: string,
  target: 'welcome' | 'goodbye',
): Promise<{ readonly ok: boolean }> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/welcome/background?target=${target}`,
      {
        method: 'DELETE',
        cache: 'no-store',
        headers: { accept: 'application/json', cookie: await buildCookieHeader() },
      },
    );
    if (response.ok || response.status === 204) {
      revalidatePath(`/guilds/${guildId}/modules/welcome`);
      return { ok: true };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Récupère l'image de fond persistée sous forme de data URL pour
 * affichage en thumbnail. Retourne `null` si aucune image persistée
 * ou erreur réseau.
 */
export async function fetchWelcomeBackgroundDataUrl(
  guildId: string,
  target: 'welcome' | 'goodbye',
): Promise<string | null> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/welcome/background?target=${target}`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: { cookie: await buildCookieHeader() },
      },
    );
    if (!response.ok) return null;
    const mime = response.headers.get('content-type') ?? 'image/png';
    const buf = Buffer.from(await response.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export type TestWelcomeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly detail?: string };

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
    const body = (await response.json().catch(() => ({}))) as {
      reason?: string;
      detail?: string;
      details?: Array<{ path?: unknown; message?: string }>;
    };
    // Concatène les détails de validation Zod si présents.
    let detail = body.detail;
    if (detail === undefined && Array.isArray(body.details) && body.details.length > 0) {
      detail = body.details
        .map((d) => {
          const path = Array.isArray(d.path) ? d.path.join('.') : String(d.path ?? '');
          return path !== '' ? `${path} : ${d.message ?? ''}` : (d.message ?? '');
        })
        .filter((s) => s.length > 0)
        .join(' ; ');
    }
    return {
      ok: false,
      reason: body.reason ?? `http-${response.status}`,
      ...(detail !== undefined && detail.length > 0 ? { detail } : {}),
    };
  } catch (error) {
    return { ok: false, reason: 'network', detail: error instanceof Error ? error.message : '' };
  }
}
