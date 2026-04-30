/**
 * Helper qui pilote l'état du mock API (jalon 7 PR 7.1) entre
 * « setup en cours » et « setup terminée », pour que les specs
 * E2E qui veulent des contextes différents (landing vs wizard)
 * ne se marchent pas dessus au sein du même run Playwright.
 *
 * Le mock écoute `POST /__test/configure {configured: bool}` et
 * met à jour son état interne. Le middleware Next.js désactive
 * son cache positif quand `NODE_ENV=test`, donc le changement
 * est immédiatement visible côté dashboard.
 */

const MOCK_API_URL = 'http://127.0.0.1:4002';

export async function setMockConfigured(configured: boolean): Promise<void> {
  const response = await fetch(`${MOCK_API_URL}/__test/configure`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ configured }),
  });
  if (!response.ok) {
    throw new Error(`mock configure failed: HTTP ${response.status}`);
  }
}

/**
 * Etat des champs renvoyés par `GET /setup/status` côté mock. Permet
 * aux specs E2E (PR 7.6 — persistance form) de simuler un retour en
 * arrière dans le wizard avec valeurs déjà enregistrées en DB.
 *
 * Champs partiels : seuls les champs fournis sont mis à jour ; les
 * autres conservent leur valeur précédente. Pour réinitialiser, passer
 * explicitement `null` (ou `false` pour les booléens).
 */
export interface MockSetupState {
  readonly currentStep?: number;
  readonly discordAppId?: string | null;
  readonly discordPublicKey?: string | null;
  readonly hasBotToken?: boolean;
  readonly hasClientSecret?: boolean;
  readonly botName?: string | null;
  readonly botDescription?: string | null;
  readonly botAvatarUrl?: string | null;
}

export async function setMockSetupState(patch: MockSetupState): Promise<void> {
  const response = await fetch(`${MOCK_API_URL}/__test/setup-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`mock setup-state failed: HTTP ${response.status}`);
  }
}
