import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright pour le dashboard.
 *
 * Smoke + golden paths critiques. Le `webServer` lance le dashboard
 * en mode dev (Turbopack) sur un port dédié pour ne pas entrer en
 * conflit avec un serveur déjà en cours côté développeur. La phase
 * d'install des navigateurs (`pnpm exec playwright install chromium`)
 * est laissée à l'initiative de l'admin — pas de download automatique
 * pour ne pas alourdir le `pnpm install` de tous les workspaces.
 *
 * NB : ces specs E2E vérifient uniquement les flux qui ne nécessitent
 * pas de session Discord. Le login (Discord OAuth réel) ne peut pas
 * être joué automatiquement ; on couvre la landing publique et les
 * redirects d'auth. Pour les pages admin protégées, prévoir une
 * fixture qui mint un JWT signé via `VARDE_AUTH_SECRET` et le pose
 * en cookie `varde.session` (chantier de l'itération suivante).
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Pas de retry par défaut en local ; CI peut surcharger via env. */
  retries: process.env['CI'] ? 2 : 0,
  /*
   * 1 worker pour sérialiser les specs : le mock API du wizard
   * (`setup-api-mock.mjs`) porte un état partagé (`configured`)
   * que landing.spec.ts et setup-wizard.spec.ts veulent
   * différent. En parallèle, le `beforeAll` de l'un écrase celui
   * de l'autre par ordre de scheduling et fait flapper les tests
   * tardifs du wizard. La perf gagnée par `workers: 2` est
   * négligeable sur 16 specs.
   */
  workers: 1,
  /* Reporters compacts en local, GitHub Actions sur CI. */
  reporter: process.env['CI'] ? 'github' : [['list']],
  /* Output dans un dossier dédié — gitignoré. */
  outputDir: './test-results',

  /*
   * `next dev` compile les routes à la demande — la 1ʳᵉ requête
   * sur une page froide peut prendre plusieurs secondes en CI.
   * 10 s de timeout par expect couvre ça sans masquer un vrai
   * blocage (les vraies erreurs se manifestent plutôt en quelques
   * centaines de ms).
   */
  expect: {
    timeout: 10 * 1000,
  },

  use: {
    baseURL: 'http://127.0.0.1:3001',
    /* Trace + screenshot uniquement à l'échec, pour ne pas saturer le disque. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /*
     * Locale FR par défaut pour aligner les tests sur les chaînes
     * `messages/fr.json` (locale par défaut du dashboard cf.
     * `i18n/config.ts`). Sans ça, Chromium envoie `Accept-Language:
     * en-US,...` et next-intl résout en EN, faisant échouer les
     * regex FR.
     */
    locale: 'fr-FR',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * Deux serveurs en parallèle :
   *
   * 1. Mock HTTP de l'API du wizard (port 4002). Sert les routes
   *    `/setup/*` avec des réponses pré-cuites (cas par défaut :
   *    setup non configurée + tout vert) — voir
   *    `tests/e2e/fixtures/setup-api-mock.ts`. Évite la dépendance
   *    au vrai `apps/server` + Postgres pendant les E2E du wizard.
   * 2. Next.js dev sur 3001 (le 3000 est typiquement déjà pris par
   *    le shell développeur). `VARDE_API_URL` pointe vers le mock.
   *
   * `reuseExistingServer: !CI` accélère les itérations locales.
   */
  webServer: [
    {
      // Mock écrit en `.mjs` plutôt qu'en `.ts` : pas de
      // dépendance `tsx`, démarrage déterministe en CI.
      command: 'node tests/e2e/fixtures/setup-api-mock.mjs',
      port: 4002,
      reuseExistingServer: !process.env['CI'],
      timeout: 30 * 1000,
      env: { PORT: '4002' },
    },
    {
      // Next.js honore `PORT` natif — on évite le `pnpm dev -- --port`
      // qui ne plumbe pas le flag à travers les versions récentes de
      // pnpm (qui interprètent le second `--` comme un argument
      // positional « directory » côté Next).
      command: 'pnpm dev',
      port: 3001,
      reuseExistingServer: !process.env['CI'],
      // Next dev compile à la première requête — `120 s` couvre les
      // runners CI lents sans rester bloqué indéfiniment si quelque
      // chose dérape côté build.
      timeout: 120 * 1000,
      env: {
        PORT: '3001',
        // Auth.js refuse de se charger sans secret ; on injecte une valeur
        // de test si elle n'est pas déjà fournie. Pour les specs qui
        // signent une session JWT, le test devra utiliser le même secret.
        VARDE_AUTH_SECRET: process.env['VARDE_AUTH_SECRET'] ?? 'e2e-secret-not-for-prod',
        // Le middleware Next.js et les server actions du wizard tapent
        // sur `VARDE_API_URL` — on les redirige vers le mock HTTP du
        // sous-livrable 6.
        VARDE_API_URL: 'http://127.0.0.1:4002',
      },
    },
  ],
});
