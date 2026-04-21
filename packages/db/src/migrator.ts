import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';

import type { DbClient, DbDriver } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Résout le dossier de migrations pour un driver. Pointe par défaut
 * sur les migrations commitées dans ce paquet ; peut être surchargé
 * par les tests qui veulent pointer sur un dossier temporaire.
 */
export function defaultMigrationsFolder(driver: DbDriver): string {
  return path.resolve(here, '..', 'migrations', driver);
}

/** Applique toutes les migrations disponibles sur le client fourni. */
export async function applyMigrations<D extends DbDriver>(
  client: DbClient<D>,
  migrationsFolder: string = defaultMigrationsFolder(client.driver),
): Promise<void> {
  if (client.driver === 'pg') {
    const pgClient = client as DbClient<'pg'>;
    await migratePg(pgClient.db, { migrationsFolder });
    return;
  }
  const sqliteClient = client as DbClient<'sqlite'>;
  migrateSqlite(sqliteClient.db, { migrationsFolder });
}
