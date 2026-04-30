import { expect, test } from '@playwright/test';

import { setMockConfigured, setMockSetupState } from './fixtures/mock-state';

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

  test('stepper marque welcome=current et les 6 autres=future', async ({ page }) => {
    await page.goto('/setup/welcome');
    await expect(page.getByTestId('wizard-stepper')).toBeVisible();
    await expect(page.getByTestId('wizard-step-welcome')).toHaveAttribute('data-status', 'current');
    await expect(page.getByTestId('wizard-step-system-check')).toHaveAttribute(
      'data-status',
      'future',
    );
    await expect(page.getByTestId('wizard-step-summary')).toHaveAttribute('data-status', 'future');
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
  test('discord-app affiche les deux champs identifiant d application + clé publique', async ({
    page,
  }) => {
    await page.goto('/setup/discord-app');
    await expect(page.getByLabel(/Identifiant d'application/i)).toBeVisible();
    await expect(page.getByLabel(/Clé publique/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Valider/i })).toBeVisible();
  });

  test('bot-token affiche le champ password et le bouton « Afficher »', async ({ page }) => {
    // E2E volontairement réduit à la présence des éléments. La
    // mécanique de bascule afficher/masquer (useState côté client)
    // est testée en jsdom dans `tests/unit/SecretField.test.tsx`,
    // ce qui contourne la course Playwright vs. hydration React
    // qu'on observait sur Turbopack dev en CI froid.
    await page.goto('/setup/bot-token');
    const tokenField = page.locator('input[name="token"]');
    await expect(tokenField).toBeVisible();
    await expect(tokenField).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: /Afficher/i })).toBeVisible();
  });

  test('oauth affiche l URI de redirection avec un bouton copier', async ({ page }) => {
    await page.goto('/setup/oauth');
    await expect(page.getByRole('button', { name: /Copier/i })).toBeVisible();
    // L'URI reflète le baseUrl renvoyé par le mock — on lit la valeur
    // du `<input readonly>` de `CopyableField`.
    const redirectInput = page.getByLabel(/URI de redirection à coller dans Discord/i);
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

test.describe('wizard de setup — persistance des formulaires (PR 7.6)', () => {
  test.beforeEach(async () => {
    // Réinitialise l'état entre tests pour qu'un test ne pollue
    // pas les suivants avec ses valeurs persistées.
    await setMockSetupState({
      currentStep: 1,
      discordAppId: null,
      discordPublicKey: null,
      hasBotToken: false,
      hasClientSecret: false,
      botName: null,
      botDescription: null,
      botAvatarUrl: null,
    });
  });

  test('discord-app pré-remplit l identifiant et la clé publique déjà saisis', async ({ page }) => {
    await setMockSetupState({
      discordAppId: '987654321098765432',
      discordPublicKey: 'a'.repeat(64),
    });
    await page.goto('/setup/discord-app');
    await expect(page.getByLabel(/Identifiant d'application/i)).toHaveValue('987654321098765432');
    await expect(page.getByLabel(/Clé publique/i)).toHaveValue('a'.repeat(64));
  });

  test('bot-token affiche le banner « enregistré » quand hasBotToken=true', async ({ page }) => {
    await setMockSetupState({ hasBotToken: true });
    await page.goto('/setup/bot-token');
    await expect(page.getByTestId('bot-token-saved-banner')).toBeVisible();
    await expect(page.getByTestId('bot-token-keep-button')).toBeVisible();
    await expect(page.getByTestId('bot-token-edit-button')).toBeVisible();
    // L'input password n'est PAS rendu tant qu'on n'a pas cliqué Modifier.
    await expect(page.locator('input[name="token"]')).toHaveCount(0);
  });

  // Note : le test « click sur Modifier révèle l'input » est volontairement
  // absent ici. La bascule `useState` est trivialement vérifiable en unit
  // (jsdom + React Testing Library), et la jouer en E2E ouvre une course
  // hydratation React vs Playwright (le click peut arriver avant que
  // l'`onClick` ne soit attaché). On garde l'E2E sur la sémantique
  // persistance (banner visible / absent, pas de leak), et on laissera
  // un test unit dédié couvrir l'interactivité.

  test('oauth affiche le banner « enregistré » quand hasClientSecret=true', async ({ page }) => {
    await setMockSetupState({ hasClientSecret: true });
    await page.goto('/setup/oauth');
    await expect(page.getByTestId('oauth-saved-banner')).toBeVisible();
    await expect(page.getByTestId('oauth-keep-button')).toBeVisible();
    await expect(page.getByTestId('oauth-edit-button')).toBeVisible();
    await expect(page.locator('input[name="clientSecret"]')).toHaveCount(0);
  });

  test('identity pré-remplit nom et description, et affiche l avatar enregistré', async ({
    page,
  }) => {
    await setMockSetupState({
      botName: 'Mon Bot',
      botDescription: 'Description test',
      botAvatarUrl: 'https://cdn.discordapp.com/app-icons/123/abc.png',
    });
    await page.goto('/setup/identity');
    await expect(page.getByLabel(/Nom du bot/i)).toHaveValue('Mon Bot');
    await expect(page.getByLabel(/Description/i)).toHaveValue('Description test');
    await expect(page.getByTestId('identity-avatar-saved')).toBeVisible();
  });

  test('discord-app sans valeur persistée : champs vides (pas de leak)', async ({ page }) => {
    // beforeEach a déjà reset l'état → tous les champs null/false
    await page.goto('/setup/discord-app');
    await expect(page.getByLabel(/Identifiant d'application/i)).toHaveValue('');
    await expect(page.getByLabel(/Clé publique/i)).toHaveValue('');
  });
});
