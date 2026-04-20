import type { DatabaseFor, DbClient, DbDriver } from './client.js';

/**
 * Exécute `fn` dans une transaction. La transaction est rollbackée si
 * `fn` lève, sinon committée. S'appuie sur `db.transaction()` de Drizzle
 * qui fait le bon choix PG/SQLite.
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
  return sqliteClient.db.transaction((tx) => fn(tx as unknown as DatabaseFor<D>) as unknown) as T;
}
