/**
 * Point d'entrée CLI de `apps/server`. Lu par `node --env-file=.env.local
 * dist/index.js` en prod / dev monolith (ADR 0004). Responsabilités :
 *
 * 1. Lire et valider les variables d'environnement requises. Échec
 *    explicite avec `process.exit(1)` si une variable critique
 *    manque — le message indique précisément quoi faire.
 * 2. Composer un `createServer()` avec la DB, le secret d'auth et le
 *    port demandés.
 * 3. Enregistrer les modules officiels (V1 : uniquement
 *    `hello-world`) dans le `PluginLoader` puis `loadAll()`.
 * 4. Seed optionnel de la table `guilds` pour le smoke manuel
 *    (`VARDE_SEED_GUILD_IDS` séparés par des virgules) et
 *    auto-enable de hello-world sur ces guilds.
 * 5. `.start()` l'API Fastify, brancher SIGINT / SIGTERM sur un
 *    shutdown gracieux.
 *
 * Hors scope de ce bin (à livrer en suivi) :
 * - Gateway discord.js : un `Client` discord.js attaché au
 *   dispatcher via `attachDiscordClient` (apps/bot) pour recevoir
 *   `guildMemberAdd` et les slash commands. Tant qu'il n'est pas
 *   branché, le serveur ne fait que répondre à l'API HTTP — c'est
 *   suffisant pour valider le critère de sortie dashboard ↔ API ↔
 *   DB de PR 2.10 via le smoke manuel.
 * - Wiring Redis (BullMQ, cache, pub/sub). Le mode dégradé ADR 0003
 *   reste la cible en V1.
 */

import type { GuildId, Logger, ModuleId } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { pgSchema, sqliteSchema } from '@varde/db';
import { helloWorld } from '@varde/module-hello-world';

import { createServer } from './server.js';

type ServerHandle = Awaited<ReturnType<typeof createServer>>;

const die = (message: string): never => {
  process.stderr.write(`[varde-server] ${message}\n`);
  process.exit(1);
};

const readRequired = (name: string): string => {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    return die(
      `variable d'environnement "${name}" manquante. Copier .env.example vers .env.local, remplir, puis relancer avec --env-file=.env.local.`,
    );
  }
  return value;
};

const readOptional = (name: string, fallback: string): string => {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

const parsePort = (raw: string, name: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    return die(`"${name}" doit être un entier [1, 65535] (reçu : ${raw}).`);
  }
  return value;
};

const pickDriver = (url: string): 'pg' | 'sqlite' => {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'pg';
  return 'sqlite';
};

const seedGuildIds = (raw: string): readonly string[] => {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

async function seedGuilds(
  handle: ServerHandle,
  ids: readonly string[],
  logger: Logger,
): Promise<void> {
  if (ids.length === 0) return;
  const client = handle.client;
  for (const id of ids) {
    try {
      if (client.driver === 'pg') {
        await (
          client.db as unknown as {
            insert: (table: unknown) => {
              values: (row: unknown) => {
                onConflictDoNothing: () => Promise<unknown>;
              };
            };
          }
        )
          .insert(pgSchema.guilds)
          .values({ id, name: `seed-${id}` })
          .onConflictDoNothing();
      } else {
        (
          client.db as unknown as {
            insert: (table: unknown) => {
              values: (row: unknown) => {
                onConflictDoNothing: () => { run: () => unknown };
              };
            };
          }
        )
          .insert(sqliteSchema.guilds)
          .values({ id, name: `seed-${id}` })
          .onConflictDoNothing()
          .run();
      }
    } catch (error) {
      logger.warn('seed guild échoué', {
        err: error instanceof Error ? error.message : String(error),
        guildId: id,
      });
    }
  }
}

async function enableHelloWorldOnSeededGuilds(
  handle: ServerHandle,
  ids: readonly string[],
  logger: Logger,
): Promise<void> {
  const moduleId = 'hello-world' as ModuleId;
  for (const id of ids) {
    try {
      await handle.loader.enable(id as GuildId, moduleId);
    } catch (error) {
      logger.warn('enable hello-world échoué', {
        err: error instanceof Error ? error.message : String(error),
        guildId: id,
      });
    }
  }
}

async function main(): Promise<void> {
  const databaseUrl = readRequired('VARDE_DATABASE_URL');
  const authSecret = readRequired('VARDE_AUTH_SECRET');
  const port = parsePort(readOptional('VARDE_API_PORT', '4000'), 'VARDE_API_PORT');
  const host = readOptional('VARDE_API_HOST', '127.0.0.1');
  const corsOrigin = readOptional('VARDE_DASHBOARD_URL', 'http://localhost:3000');
  const logLevel = readOptional('VARDE_LOG_LEVEL', 'info') as
    | 'trace'
    | 'debug'
    | 'info'
    | 'warn'
    | 'error'
    | 'fatal';
  const seedIds = seedGuildIds(readOptional('VARDE_SEED_GUILD_IDS', ''));

  const logger = createLogger({ level: logLevel });

  const driver = pickDriver(databaseUrl);
  const handle =
    driver === 'pg'
      ? await createServer({
          database: { driver: 'pg', url: databaseUrl },
          api: { port, host, corsOrigin, authSecret },
          logger,
        })
      : await createServer({
          database: { driver: 'sqlite', url: databaseUrl },
          api: { port, host, corsOrigin, authSecret },
          logger,
        });

  handle.loader.register(helloWorld);
  await handle.loader.loadAll();

  if (seedIds.length > 0) {
    await seedGuilds(handle, seedIds, logger);
    await enableHelloWorldOnSeededGuilds(handle, seedIds, logger);
    logger.info('seed guilds appliqué + hello-world activé', { count: seedIds.length });
  }

  const { address } = await handle.start();
  logger.info('varde-server démarré', { address, driver, seedCount: seedIds.length });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('varde-server : shutdown demandé', { signal });
    try {
      await handle.stop();
      logger.info('varde-server : arrêt propre');
      process.exit(0);
    } catch (error) {
      logger.error(
        'varde-server : erreur pendant le shutdown',
        error instanceof Error ? error : new Error(String(error)),
      );
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  process.stderr.write(`[varde-server] démarrage échoué : ${String(error)}\n`);
  process.exit(1);
});
