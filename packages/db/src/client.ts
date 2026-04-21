import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as pgSchema from './schema/pg.js';
import * as sqliteSchema from './schema/sqlite.js';

/** Drivers DB supportés par le core. */
export type DbDriver = 'pg' | 'sqlite';

/** Client Drizzle Postgres typé avec le schéma complet du core. */
export type PgDatabase = PostgresJsDatabase<typeof pgSchema>;

/** Client Drizzle SQLite typé avec le schéma complet du core. */
export type SqliteDatabaseClient = BetterSQLite3Database<typeof sqliteSchema>;

/** Sélectionne le type Drizzle correspondant au driver. */
export type DatabaseFor<D extends DbDriver> = D extends 'pg' ? PgDatabase : SqliteDatabaseClient;

/** Façade uniforme autour d'un client Drizzle et de son driver sous-jacent. */
export interface DbClient<D extends DbDriver = DbDriver> {
  readonly driver: D;
  readonly db: DatabaseFor<D>;
  readonly close: () => Promise<void>;
}

/** Options de configuration communes aux drivers. */
export interface CreateDbClientOptions<D extends DbDriver> {
  readonly driver: D;
  readonly url: string;
  /** Taille de pool Postgres. Ignoré pour SQLite. */
  readonly poolSize?: number;
}

interface PgHandle {
  readonly driver: 'pg';
  readonly db: PgDatabase;
  readonly raw: Sql;
}

interface SqliteHandle {
  readonly driver: 'sqlite';
  readonly db: SqliteDatabaseClient;
  readonly raw: SqliteDatabase;
}

type DbHandle = PgHandle | SqliteHandle;

const buildPg = (url: string, poolSize: number): PgHandle => {
  const raw = postgres(url, { max: poolSize });
  const db = drizzlePg(raw, { schema: pgSchema });
  return { driver: 'pg', db, raw };
};

const buildSqlite = (url: string): SqliteHandle => {
  const raw = new Database(url);
  raw.pragma('foreign_keys = ON');
  raw.pragma('journal_mode = WAL');
  const db = drizzleSqlite(raw, { schema: sqliteSchema });
  return { driver: 'sqlite', db, raw };
};

/**
 * Construit un client DB selon le driver demandé. Connexion paresseuse :
 * `createDbClient` ouvre la connexion immédiatement, l'appelant doit
 * appeler `close()` pour relâcher les ressources (pool Postgres ou
 * handle SQLite).
 */
export function createDbClient<D extends DbDriver>(options: CreateDbClientOptions<D>): DbClient<D> {
  const handle: DbHandle =
    options.driver === 'pg'
      ? buildPg(options.url, options.poolSize ?? 10)
      : buildSqlite(options.url);

  const close = async (): Promise<void> => {
    if (handle.driver === 'pg') {
      await handle.raw.end();
    } else {
      handle.raw.close();
    }
  };

  return {
    driver: options.driver,
    db: handle.db as DatabaseFor<D>,
    close,
  };
}
