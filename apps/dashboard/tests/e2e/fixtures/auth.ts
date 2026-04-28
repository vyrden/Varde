import type { BrowserContext } from '@playwright/test';
import { SignJWT } from 'jose';

/**
 * Helpers d'authentification pour les tests E2E.
 *
 * Le dashboard utilise Auth.js v5 avec une stratégie JWT HS256 et
 * un cookie `varde.session` (cf. `apps/dashboard/auth.ts`). Le test
 * E2E ne peut pas jouer le flow Discord OAuth réel ; à la place, on
 * forge directement un JWT signé avec le même secret que le serveur
 * et on le pose comme cookie sur le contexte browser.
 *
 * Pré-requis : le `VARDE_AUTH_SECRET` du test doit être identique
 * à celui du `webServer` Next dans `playwright.config.ts`. La valeur
 * `e2e-secret-not-for-prod` est utilisée par défaut côté config.
 */

const SESSION_COOKIE_NAME = 'varde.session';
const DEFAULT_SECRET = 'e2e-secret-not-for-prod';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60; // 1h, suffisant pour un run de test.

export interface SessionPayload {
  /** ID Discord du user. Devient le `sub` du JWT. */
  readonly userId: string;
  /** Username affiché côté UI. */
  readonly username: string;
  /**
   * Access token Discord. Mocké par défaut. Les tests qui n'appellent
   * pas l'API Discord (via les mocks MSW) peuvent garder le default.
   */
  readonly accessToken?: string;
}

/**
 * Pose une session valide dans le contexte browser fourni. À appeler
 * **avant** la première navigation du test, sinon la requête initiale
 * partira sans cookie et le redirect d'auth jouera.
 */
export async function loginAs(
  context: BrowserContext,
  payload: SessionPayload,
  options: { readonly secret?: string; readonly host?: string } = {},
): Promise<void> {
  const secret = options.secret ?? process.env['VARDE_AUTH_SECRET'] ?? DEFAULT_SECRET;
  const host = options.host ?? '127.0.0.1';

  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({
    accessToken: payload.accessToken ?? 'mock-access-token',
    name: payload.username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DEFAULT_SESSION_MAX_AGE_SECONDS}s`)
    .setSubject(payload.userId)
    .sign(key);

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: host,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

/**
 * Inverse de `loginAs` — efface le cookie de session pour simuler
 * un logout. Utile dans les tests qui exercent les redirects
 * publics après déconnexion.
 */
export async function logout(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  await context.clearCookies({ name: SESSION_COOKIE_NAME });
  // Au cas où Auth.js ait posé son propre cookie csrf en parallèle,
  // on nettoie les cookies orphelins du même domaine.
  const orphaned = cookies.filter((c) => c.name.startsWith('authjs.'));
  for (const cookie of orphaned) {
    await context.clearCookies({ name: cookie.name });
  }
}
