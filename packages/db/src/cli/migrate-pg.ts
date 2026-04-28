import process from 'node:process';
import { createDbClient } from '../client.js';
import { applyMigrations } from '../migrator.js';

const url = process.env['VARDE_DATABASE_URL'];

if (typeof url !== 'string' || url.length === 0) {
  process.stderr.write('VARDE_DATABASE_URL est requis dans l environnement.\n');
  process.exit(1);
}

const client = createDbClient({ driver: 'pg', url });
try {
  await applyMigrations(client);
  process.stderr.write('[db] migrations Postgres appliquées\n');
} finally {
  await client.close();
}
