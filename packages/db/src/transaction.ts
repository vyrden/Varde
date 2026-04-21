import { sql } from 'drizzle-orm';

import type { DatabaseFor, DbClient, DbDriver } from './client.js';

/**
 * Exécute `fn` dans une transaction. Rollback automatique si `fn` lève.
 *
 * Postgres : s'appuie sur `db.transaction()` natif de Drizzle, qui
 * accepte un callback asynchrone et émet `BEGIN` / `COMMIT` / `ROLLBACK`.
 *
 * SQLite (better-sqlite3) : son API de transaction est synchrone et
 * refuse un callback `async`. On simule donc une transaction asynchrone
 * en pilotant manuellement `BEGIN` / `COMMIT` / `ROLLBACK` via raw SQL
 * sur le client Drizzle lui-même. Limite de fait : pas de transactions
 * SQLite imbriquées via cette API.
 */
export async function withTransaction<D extends DbDriver, T>(
  client: DbClient<D>,
  fn: (tx: DatabaseFor<D>) => Promise<T> | T,
): Promise<T> {
  if (client.driver === 'pg') {
    const pgClient = client as DbClient<'pg'>;
    return pgClient.db.transaction(async (tx) => fn(tx as unknown as DatabaseFor<D>));
  }
  const sqliteClient = client as DbClient<'sqlite'>;
  await sqliteClient.db.run(sql`BEGIN`);
  try {
    const result = await fn(sqliteClient.db as unknown as DatabaseFor<D>);
    await sqliteClient.db.run(sql`COMMIT`);
    return result;
  } catch (error) {
    await sqliteClient.db.run(sql`ROLLBACK`);
    throw error;
  }
}
