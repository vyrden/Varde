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
  /* Workers limités pour éviter de spawner 10× le serveur Next. */
  workers: 2,
  /* Reporters compacts en local, GitHub Actions sur CI. */
  reporter: process.env['CI'] ? 'github' : [['list']],
  /* Output dans un dossier dédié — gitignoré. */
  outputDir: './test-results',

  use: {
    baseURL: 'http://127.0.0.1:3001',
    /* Trace + screenshot uniquement à l'échec, pour ne pas saturer le disque. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * Lance Next en dev sur 3001 (le 3000 est typiquement déjà pris par
   * le shell développeur). Réutilise une instance déjà démarrée si
   * `reuseExistingServer` est vrai en local — accélère les itérations.
   */
  webServer: {
    command: 'pnpm dev -- --port 3001',
    port: 3001,
    reuseExistingServer: !process.env['CI'],
    timeout: 60 * 1000,
    env: {
      // Auth.js refuse de se charger sans secret ; on injecte une valeur
      // de test si elle n'est pas déjà fournie. Pour les specs qui
      // signent une session JWT, le test devra utiliser le même secret.
      VARDE_AUTH_SECRET: process.env['VARDE_AUTH_SECRET'] ?? 'e2e-secret-not-for-prod',
    },
  },
});
