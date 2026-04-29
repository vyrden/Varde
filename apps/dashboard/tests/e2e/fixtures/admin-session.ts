import type { BrowserContext } from '@playwright/test';
import { SignJWT } from 'jose';

/**
 * Mint un JWT signé avec `VARDE_AUTH_SECRET` (même secret que celui
 * du webServer Playwright) et le pose en cookie `varde.session`
 * sur le contexte Playwright fourni. Le format reproduit ce que
 * Auth.js v5 produit après un login Discord réussi (cf.
 * `apps/dashboard/auth.ts` — `jwt.encode`).
 *
 * Utilisé par les specs admin pour matérialiser une session owner
 * sans rejouer un OAuth Discord réel (impossible en E2E
 * automatisé).
 */

const SECRET = process.env['VARDE_AUTH_SECRET'] ?? 'e2e-secret-not-for-prod';
const COOKIE = 'varde.session';

export interface AdminSessionPayload {
  /** Discord user ID — doit matcher un owner du mock pour passer le guard. */
  readonly discordUserId: string;
  /** Username affiché dans le header. Optionnel. */
  readonly username?: string;
}

/**
 * Pose un cookie `varde.session` valide sur l'origine 127.0.0.1:3001
 * (la baseURL Playwright). Le JWT a une expiration 7 jours pour
 * matcher le maxAge configuré côté Auth.js.
 */
export async function setAdminSession(
  context: BrowserContext,
  payload: AdminSessionPayload,
): Promise<void> {
  const key = new TextEncoder().encode(SECRET);
  const tokenPayload: Record<string, unknown> = { sub: payload.discordUserId };
  if (payload.username !== undefined) {
    tokenPayload['username'] = payload.username;
  }
  const token = await new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(payload.discordUserId)
    .sign(key);

  await context.addCookies([
    {
      name: COOKIE,
      value: token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

/** URL d'admin-state mutator du mock — exposé pour réinitialiser entre tests. */
export const ADMIN_STATE_MUTATOR_URL = 'http://127.0.0.1:4002/__test/admin-state';
