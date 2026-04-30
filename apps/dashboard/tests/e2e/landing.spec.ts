import { expect, test } from '@playwright/test';

import { setMockConfigured } from './fixtures/mock-state';

/**
 * Smoke E2E — vérifie que le squelette du dashboard se sert et que
 * les redirects d'auth élémentaires fonctionnent. Pas de login Discord
 * réel : ces specs ne couvrent que les chemins publics et le retour
 * silencieux vers `/` quand on tape une URL admin sans session.
 *
 * **Contexte mock** : ces specs supposent une instance déjà configurée
 * (`setup_completed_at` posé). Sans ça, le middleware du wizard
 * redirige `/` vers `/setup/welcome` et la landing card ne s'affiche
 * jamais. On bascule le mock dans `configured: true` au beforeAll.
 *
 * Pré-requis : exécuter `pnpm exec playwright install chromium` une
 * fois par poste pour télécharger le binaire navigateur (non livré
 * dans le `pnpm install` standard pour ne pas alourdir le repo).
 */

test.beforeAll(async () => {
  await setMockConfigured(true);
});

test.describe('landing publique', () => {
  test('rend la card de connexion Discord pour un visiteur sans session', async ({ page }) => {
    await page.goto('/');
    // Le titre du card et le CTA Discord sont stables — assertions
    // tolérantes à une refonte du layout autour.
    await expect(page.getByRole('button', { name: /Se connecter avec Discord/i })).toBeVisible();
    await expect(page.getByText(/Bienvenue sur Varde/i)).toBeVisible();
  });

  test('affiche la redirect URI à enregistrer dans le SignInRedirectHint', async ({ page }) => {
    // PR 7.5 : la card de connexion expose la redirect URI (calculée
    // côté serveur depuis les headers de la requête) pour qu'un admin
    // qui hit « redirect_uri non valide » puisse la copier sans
    // relire la doc. L'encart est dans un `<details>` — visible mais
    // collapsed par défaut.
    await page.goto('/');
    const uri = page.getByTestId('signin-redirect-uri');
    // L'URI doit refléter l'origin de la requête (Playwright tape sur
    // 127.0.0.1:3001) — pas une valeur figée en env.
    await expect(uri).toHaveText(/127\.0\.0\.1:3001\/api\/auth\/callback\/discord$/u);
  });

  test('le bouton de connexion poste vers /api/auth/signin/* sans valeur env Discord', async ({
    page,
  }) => {
    // PR 7.5 sub-livrable 7 : ce test garde la propriété qu'aucune
    // variable `VARDE_DISCORD_CLIENT_ID` / `VARDE_DISCORD_CLIENT_SECRET`
    // n'est nécessaire pour servir le SignInCard. Auth.js fetch les
    // credentials depuis le mock `/internal/oauth-credentials` à la
    // demande (cf. `playwright.config.ts` — l'env passé au dashboard
    // n'inclut pas ces variables).
    await page.goto('/');
    const button = page.getByRole('button', { name: /Se connecter avec Discord/i });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});

test.describe('redirects de protection', () => {
  test('une URL guild sans session retombe sur la landing', async ({ page }) => {
    // ID de guild quelconque, le middleware doit pousser vers `/`
    // avant même de tenter un fetch API. Le contenu attendu est la
    // landing publique.
    const response = await page.goto('/guilds/000000000000000000');
    // Page rendue (200) — le redirect Next se fait côté serveur, le
    // body final est celui de `/`.
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('button', { name: /Se connecter avec Discord/i })).toBeVisible();
  });

  test('une URL settings sans session retombe aussi sur la landing', async ({ page }) => {
    await page.goto('/guilds/000000000000000000/settings');
    await expect(page.getByRole('button', { name: /Se connecter avec Discord/i })).toBeVisible();
  });
});
