/**
 * Runner CLI de migration. Appelé via `pnpm db:migrate` (racine) ou
 * `pnpm --filter @varde/db db:migrate:{pg,sqlite}`.
 *
 * Usage : `tsx scripts/migrate.ts <pg|sqlite>` avec `VARDE_DATABASE_URL`
 * dans l'environnement.
 */
import process from 'node:process';
import { createDbClient, type DbDriver } from '../src/client.js';
import { applyMigrations } from '../src/migrator.js';

const driver = process.argv[2];
const url = process.env.VARDE_DATABASE_URL;

if (driver !== 'pg' && driver !== 'sqlite') {
  process.stderr.write('Usage : migrate <pg|sqlite> (driver manquant ou invalide)\n');
  process.exit(1);
}

if (typeof url !== 'string' || url.length === 0) {
  process.stderr.write('VARDE_DATABASE_URL est requis dans l environnement.\n');
  process.exit(1);
}

const client = createDbClient({ driver: driver as DbDriver, url });
try {
  await applyMigrations(client);
  process.stderr.write(`[db] migrations appliquées sur ${driver}\n`);
} finally {
  await client.close();
}
