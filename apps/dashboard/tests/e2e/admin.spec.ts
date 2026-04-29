import { expect, test } from '@playwright/test';

import { ADMIN_STATE_MUTATOR_URL, setAdminSession } from './fixtures/admin-session';

/**
 * E2E Playwright pour la zone `/admin/*` (jalon 7 PR 7.2 sub-livrable
 * 8). Couvre les flux structurants — accès, navigation, mutations
 * principales — sans réimplémenter les checks fins déjà couverts
 * par les tests d'intégration de l'API et les unit tests
 * dashboard.
 *
 * Auth : JWT signé avec `VARDE_AUTH_SECRET` posé en cookie
 * `varde.session`. Le mock API valide qu'un owner correspond au
 * `sub` du token.
 *
 * Préconditions communes :
 *
 * - Mock configuré (`/__test/configure { configured: true }`) pour
 *   désactiver le redirect-to-setup du middleware.
 * - State admin réinitialisé via `/__test/admin-state` avant chaque
 *   spec qui mute (sinon les specs s'enchaînent en partageant l'état).
 */

const OWNER_ID = '111111111111111111';

test.beforeEach(async ({ request }) => {
  // Place le mock en mode « configured » pour que le middleware
  // ne redirige pas vers /setup/welcome.
  await request.post('http://127.0.0.1:4002/__test/configure', {
    data: { configured: true },
  });
  // Reset admin state — chaque spec commence avec l'état canonique.
  await request.post(ADMIN_STATE_MUTATOR_URL, {
    data: {
      owners: [
        {
          discordUserId: OWNER_ID,
          grantedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
          grantedByDiscordUserId: null,
        },
      ],
      identity: { name: 'Mock Bot', description: 'Bot de test', avatarUrl: null },
      discord: {
        appId: '987654321098765432',
        publicKey: '0'.repeat(64),
        tokenLastFour: 'aaaa',
        hasClientSecret: true,
        intents: { presence: true, members: false, messageContent: false },
      },
      urls: {
        baseUrl: null,
        additionalUrls: [],
      },
      overview: {
        bot: { connected: false, latencyMs: null, uptime: 0, version: 'e2e' },
        guilds: { count: 0, totalMembers: null },
        modules: { installed: 0, active: 0 },
        db: { driver: 'sqlite', sizeBytes: null, lastMigration: null },
      },
    },
  });
});

test.describe('/admin guard', () => {
  test('404 sans session', async ({ page }) => {
    const response = await page.goto('/admin');
    // Next.js renvoie un 404 quand layout appelle `notFound()`.
    expect(response?.status()).toBe(404);
  });

  test('404 si session non-owner', async ({ context, page, request }) => {
    // Pose une session pour un user qui n'est pas dans la liste owners.
    await setAdminSession(context, { discordUserId: '222222222222222222' });
    // Reset à un state où seul OWNER_ID est owner.
    await request.post(ADMIN_STATE_MUTATOR_URL, {
      data: {
        owners: [
          {
            discordUserId: OWNER_ID,
            grantedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
            grantedByDiscordUserId: null,
          },
        ],
      },
    });
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
  });
});

test.describe('/admin owner flow', () => {
  test.beforeEach(async ({ context }) => {
    await setAdminSession(context, { discordUserId: OWNER_ID, username: 'TestOwner' });
  });

  test('Vue d ensemble — affiche les cartes de statut', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /vue d.ensemble/i })).toBeVisible();
    await expect(page.getByTestId('admin-bot-status')).toBeVisible();
    await expect(page.getByTestId('admin-guilds-count')).toBeVisible();
    await expect(page.getByTestId('admin-modules-active')).toBeVisible();
  });

  test('Identité — formulaire + aperçu présents', async ({ page }) => {
    await page.goto('/admin/identity');
    await expect(page.getByRole('heading', { name: /identité du bot/i })).toBeVisible();
    await expect(page.getByLabel(/nom/i)).toHaveValue('Mock Bot');
    await expect(page.getByTestId('admin-identity-submit')).toBeVisible();
  });

  test('Discord — 3 sous-blocs présents', async ({ page }) => {
    await page.goto('/admin/discord');
    await expect(page.getByRole('heading', { name: /application discord/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /token bot/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /oauth client secret/i })).toBeVisible();
    await expect(page.getByTestId('admin-discord-token-last-four')).toContainText('aaaa');
  });

  test('URLs — ajout d une URL additionnelle', async ({ page }) => {
    await page.goto('/admin/urls');
    await expect(page.getByTestId('admin-urls-additional-empty')).toBeVisible();
    await page.getByTestId('admin-urls-add-url-input').fill('http://192.168.1.10:3000');
    await page.getByTestId('admin-urls-add-label-input').fill('LAN');
    await page.getByTestId('admin-urls-add-submit').click();
    // Le revalidatePath force une re-render server-side. La même
    // URL apparaît dans le bloc « Redirect URIs » avec un suffixe
    // `/api/auth/callback/discord` — on cible donc la liste
    // des URLs additionnelles via son testid pour éviter le strict
    // mode violation.
    await expect(
      page.locator('[data-testid^="admin-urls-additional-item-"]').first(),
    ).toContainText('http://192.168.1.10:3000');
    await expect(
      page.locator('[data-testid^="admin-urls-additional-item-"]').first(),
    ).toContainText('LAN');
  });

  test('Ownership — liste affichée, ajout possible', async ({ page }) => {
    await page.goto('/admin/ownership');
    await expect(page.getByText(OWNER_ID)).toBeVisible();
    // Pas de bouton « Retirer » quand il ne reste qu'un seul owner.
    await expect(page.getByTestId(`admin-owner-remove-${OWNER_ID}`)).toHaveCount(0);

    await page.getByTestId('admin-ownership-add-input').fill('222222222222222222');
    await page.getByTestId('admin-ownership-add-submit').click();
    await expect(page.getByTestId('admin-ownership-add-success')).toBeVisible();
    await expect(page.getByText('222222222222222222')).toBeVisible();
  });
});
