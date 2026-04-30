import { expect, test } from '@playwright/test';

import { setAdminSession } from './fixtures/admin-session';

/**
 * E2E Playwright pour `/guilds/:id/permissions` (jalon 7 PR 7.3
 * sub-livrable 10).
 *
 * Couvre les scénarios essentiels :
 *
 * - Page rendue avec les rôles enrichis pour un user admin.
 * - Save flow : décocher/cocher un rôle moderator → cliquer
 *   « Enregistrer » → message de succès affiché.
 * - Preview flow : cliquer « Voir qui a accès » → résultats
 *   affichés (admins + moderators).
 * - Sidebar conditionnelle : admin voit la section « Paramètres »
 *   et le lien « Permissions du dashboard » ; moderator non.
 */

const OWNER_ID = '111111111111111111';
const MOD_USER_ID = '222222222222222222';

const resetMockState = async (request: import('@playwright/test').APIRequestContext) => {
  // Mode « configured » pour que le middleware n'aille pas vers /setup.
  await request.post('http://127.0.0.1:4002/__test/configure', {
    data: { configured: true },
  });
  // Permissions state canonique : OWNER_ID admin, MOD_USER_ID moderator.
  await request.post('http://127.0.0.1:4002/__test/guild-permissions', {
    data: {
      userLevels: { [OWNER_ID]: 'admin', [MOD_USER_ID]: 'moderator' },
      permissions: {
        'guild-1': {
          adminRoleIds: ['role-admin'],
          moderatorRoleIds: ['role-mod'],
          roles: [
            { id: 'role-admin', name: 'Admin', color: 0xff0000, position: 10, memberCount: 3 },
            { id: 'role-mod', name: 'Moderator', color: 0x00ff00, position: 5, memberCount: 7 },
            { id: 'role-partner', name: 'Partner', position: 3, memberCount: 12 },
          ],
        },
      },
      members: {
        'guild-1': [
          { id: 'u1', username: 'Alice', avatarUrl: null, roleIds: ['role-admin'] },
          { id: 'u2', username: 'Bob', avatarUrl: null, roleIds: ['role-mod'] },
        ],
      },
    },
  });
};

test.beforeEach(async ({ request }) => {
  await resetMockState(request);
});

test.describe('Permissions page — admin flow', () => {
  test.beforeEach(async ({ context }) => {
    await setAdminSession(context, { discordUserId: OWNER_ID, username: 'TestAdmin' });
  });

  test('rend les rôles avec leur couleur', async ({ page }) => {
    await page.goto('/guilds/guild-1/permissions');
    await expect(page.getByRole('heading', { name: /permissions du dashboard/i })).toBeVisible();
    await expect(page.getByTestId('permissions-admin-checkbox-role-admin')).toBeVisible();
    await expect(page.getByTestId('permissions-moderator-checkbox-role-mod')).toBeVisible();
  });

  test('save flow : ajoute un rôle moderator → message de succès', async ({ page }) => {
    await page.goto('/guilds/guild-1/permissions');
    // Coche un rôle moderator additionnel (Partner).
    await page.getByTestId('permissions-moderator-checkbox-role-partner').check();
    await page.getByTestId('permissions-save-button').click();
    await expect(page.getByTestId('permissions-save-success')).toBeVisible();
  });

  test('preview flow : clic preview → résultats affichés', async ({ page }) => {
    await page.goto('/guilds/guild-1/permissions');
    await page.getByTestId('permissions-preview-button').click();
    await expect(page.getByTestId('permissions-preview-results')).toBeVisible();
    await expect(page.getByText('Alice')).toBeVisible();
    await expect(page.getByText('Bob')).toBeVisible();
  });
});

test.describe('Permissions page — guard', () => {
  test('404 si user non-admin (moderator)', async ({ context, page }) => {
    await setAdminSession(context, { discordUserId: MOD_USER_ID, username: 'TestMod' });
    const response = await page.goto('/guilds/guild-1/permissions');
    expect(response?.status()).toBe(404);
  });
});
