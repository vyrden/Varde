/**
 * Reset de la base de données entre tests E2E.
 *
 * Stratégie : `TRUNCATE` ciblé des tables qui portent l'état
 * mutable du dashboard. On ne touche pas aux tables structurelles
 * (`modules_registry`, `permissions_registry`) qui sont peuplées
 * une fois au boot et lues en lecture seule par le runtime.
 *
 * URL : la variable `DATABASE_URL_TEST` doit pointer vers une DB
 * dédiée aux tests, isolée de la DB de dev. Le job CI E2E provisionne
 * cette DB via les services GitHub Actions.
 *
 * Cette fonction est volontairement minimale en PR 7.0. Les tests
 * qui ont besoin de seed plus riche (guild prête + module activé +
 * audit pré-rempli) factoriseront leur propre helper au-dessus.
 */

import postgres from 'postgres';

const TABLES_TO_TRUNCATE: readonly string[] = [
  'audit_log',
  'guild_modules',
  'guild_config',
  'permission_bindings',
  'guilds',
  'onboarding_actions_log',
  'onboarding_sessions',
  'ai_invocations',
  'keystore',
  'scheduled_tasks',
];

/**
 * Reset de la base. À appeler dans un `beforeEach` ou `beforeAll`
 * selon le besoin de partage entre tests.
 */
export async function resetDatabase(): Promise<void> {
  const url = process.env['DATABASE_URL_TEST'] ?? process.env['VARDE_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST manquant : configurer une DB Postgres dédiée pour les tests E2E.',
    );
  }

  const sql = postgres(url, { max: 1, prepare: false });
  try {
    // CASCADE pour résoudre les FK entre tables. RESTART IDENTITY
    // pour recommencer les séquences à 1 — utile aux tests qui
    // s'attendent à des IDs déterministes.
    const list = TABLES_TO_TRUNCATE.join(', ');
    await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    await sql.end();
  }
}
