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
