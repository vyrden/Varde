'use server';

import { cookies } from 'next/headers';

import type { StoredTheme } from './resolve-theme';
import { normalizeStoredTheme } from './resolve-theme';

/**
 * Server actions de la préférence thème (jalon 7 PR 7.4.9).
 *
 * Source de vérité : la table `user_preferences` côté API. Le cookie
 * `varde.theme` sert uniquement de cache SSR pour éviter le flash —
 * il est mis à jour côté client (immédiat) et côté server action
 * (en cas de discordance ou pour les clients sans JS).
 *
 * `saveThemePreference` :
 *
 * 1. Met à jour le cookie côté serveur (visible au prochain SSR).
 * 2. PUT `/me/preferences` avec le nouveau theme.
 * 3. Retourne l'état au client.
 *
 * Si l'API est indisponible (ancien binaire qui n'a pas la PR 7.4.1
 * câblée), on garde le cookie comme source de vérité — l'utilisateur
 * voit son thème localement, la persistance multi-device reprendra
 * dès que l'API est à jour.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';
const THEME_COOKIE = 'varde.theme';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 an

export type SaveThemeState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success'; readonly theme: StoredTheme }
  | { readonly kind: 'error'; readonly code: string; readonly message: string };

const buildCookieHeader = async (): Promise<string> => {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export async function saveThemePreference(theme: string): Promise<SaveThemeState> {
  const normalized = normalizeStoredTheme(theme);

  // Cookie côté serveur — secured, sameSite lax (la requête de
  // changement de thème est lancée par le user lui-même, on n'a pas
  // besoin de strict). Path racine pour que le cookie soit envoyé
  // sur toutes les pages du dashboard.
  const store = await cookies();
  store.set(THEME_COOKIE, normalized, {
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: false, // le client a besoin de le lire pour le script anti-flash
    secure: process.env['NODE_ENV'] === 'production',
  });

  // Persistance API. Erreur silencieuse — le cookie est déjà à jour,
  // l'UI reflète le bon thème.
  try {
    const res = await fetch(`${API_URL}/me/preferences`, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify({ theme: normalized }),
    });
    if (!res.ok) {
      return {
        kind: 'error',
        code: 'http_error',
        message: `API a répondu ${res.status}.`,
      };
    }
  } catch (error) {
    return {
      kind: 'error',
      code: 'network_error',
      message: error instanceof Error ? error.message : 'Erreur réseau.',
    };
  }
  return { kind: 'success', theme: normalized };
}
