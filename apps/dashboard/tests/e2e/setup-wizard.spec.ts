import { expect, test } from '@playwright/test';

import { setMockConfigured } from './fixtures/mock-state';

/**
 * E2E du wizard de setup (jalon 7 PR 7.1, sous-livrable 6).
 *
 * **Boundary** : ces specs valident le rendu et la navigation des
 * pages côté dashboard, ainsi que le contrat HTTP (codes attendus,
 * forme des réponses) avec un mock minimaliste de l'API. Le
 * comportement métier de l'API (chiffrement, persistance,
 * validation Discord) est testé séparément par les 54 tests
 * d'intégration de `apps/api/tests/integration/setup-route.test.ts`.
 *
 * Le mock HTTP (`tests/e2e/fixtures/setup-api-mock.mjs`) est lancé
 * en parallèle du dashboard par `playwright.config.ts` et répond
 * « non configurée + tout vert » par défaut. On force explicitement
 * cet état au `beforeAll` pour ne pas dépendre de l'ordre
 * d'exécution avec d'autres specs (landing.spec.ts bascule le
 * mock en `configured: true`).
 */

test.beforeAll(async () => {
  await setMockConfigured(false);
});

test.describe('wizard de setup — middleware et navigation', () => {
  test('redirige `/` vers `/setup/welcome` quand l instance n est pas configurée', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup\/welcome$/u);
    await expect(page.getByRole('heading', { level: 1, name: /Bienvenue/i })).toBeVisible();
  });

  test('rend l indicateur d étape (« Étape 1 sur 7 ») sur welcome', async ({ page }) => {
    await page.goto('/setup/welcome');
    await expect(page.getByTestId('setup-step-indicator')).toHaveText(/Étape 1 sur 7/u);
  });

  test('progress bar a aria-valuenow=1 sur welcome', async ({ page }) => {
    await page.goto('/setup/welcome');
    await expect(page.getByTestId('setup-progress')).toHaveAttribute('aria-valuenow', '1');
  });

  test('le bouton « Commencer » route vers `/setup/system-check`', async ({ page }) => {
    await page.goto('/setup/welcome');
    await page.getByRole('link', { name: /Commencer/i }).click();
    await expect(page).toHaveURL(/\/setup\/system-check$/u);
  });
});

test.describe('wizard de setup — étape system-check', () => {
  test('affiche les 3 checks tous verts via le mock API', async ({ page }) => {
    await page.goto('/setup/system-check');
    // Le mock répond `ok: true` pour les trois sondes.
    await expect(page.getByTestId('check-database')).toBeVisible();
    await expect(page.getByTestId('check-master_key')).toBeVisible();
    await expect(page.getByTestId('check-discord_connectivity')).toBeVisible();
  });

  test('affiche le detectedBaseUrl renvoyé par le mock', async ({ page }) => {
    await page.goto('/setup/system-check');
    await expect(page.getByTestId('detected-base-url')).toHaveText('http://localhost:3001');
  });

  test('le bouton « Continuer » est actif (tous les checks verts)', async ({ page }) => {
    await page.goto('/setup/system-check');
    const next = page.getByRole('link', { name: /Continuer/i });
    await expect(next).toBeVisible();
    await next.click();
    await expect(page).toHaveURL(/\/setup\/discord-app$/u);
  });
});

test.describe('wizard de setup — étapes formulaire', () => {
  test('discord-app affiche les deux champs Application ID + Public Key', async ({ page }) => {
    await page.goto('/setup/discord-app');
    await expect(page.getByLabel(/Application ID/i)).toBeVisible();
    await expect(page.getByLabel(/Public Key/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Valider/i })).toBeVisible();
  });

  test('bot-token affiche le champ password avec bascule afficher/masquer', async ({ page }) => {
    await page.goto('/setup/bot-token');
    const tokenField = page.getByLabel(/Token bot/i);
    await expect(tokenField).toBeVisible();
    await expect(tokenField).toHaveAttribute('type', 'password');

    // Hydratation React vs. Playwright : avec `next dev` + Turbopack,
    // le button SSR rend instantanément mais son handler `onClick`
    // n'est attaché qu'après le download + parse du chunk client.
    // Un click avant cet instant est un no-op silencieux. On retry
    // donc le couple click + assertion via `expect.toPass` jusqu'à
    // ce que React ait pris le relais.
    await expect(async () => {
      await page.getByRole('button', { name: /Afficher/i }).click({ timeout: 1000 });
      await expect(page.getByRole('button', { name: /Masquer/i })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000, intervals: [250, 500, 1000] });
    await expect(tokenField).toHaveAttribute('type', 'text');
  });

  test('oauth affiche l URI de redirection avec un bouton copier', async ({ page }) => {
    await page.goto('/setup/oauth');
    await expect(page.getByRole('button', { name: /Copier/i })).toBeVisible();
    // L'URI reflète le baseUrl renvoyé par le mock — on lit la valeur
    // du `<input readonly>` de `CopyableField`.
    const redirectInput = page.getByLabel(/Redirect URI à coller dans Discord/i);
    await expect(redirectInput).toHaveValue(/\/api\/auth\/callback\/discord$/u);
  });

  test('identity propose nom, avatar et description, plus un bouton « Passer »', async ({
    page,
  }) => {
    await page.goto('/setup/identity');
    await expect(page.getByLabel(/Nom du bot/i)).toBeVisible();
    await expect(page.getByLabel(/Description/i)).toBeVisible();
    await expect(page.getByLabel(/Avatar/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Passer cette étape/i })).toBeVisible();
  });

  test('summary affiche la checklist verte et le bouton « Démarrer Varde »', async ({ page }) => {
    await page.goto('/setup/summary');
    await expect(page.getByTestId('summary-checklist')).toBeVisible();
    await expect(page.getByTestId('summary-start')).toBeVisible();
  });
});
