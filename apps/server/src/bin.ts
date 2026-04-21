/**
 * Point d'entrée CLI de `apps/server`. Lu par `node --env-file=.env.local
 * dist/bin.js` en prod / dev monolith (ADR 0004). Responsabilités :
 *
 * 1. Lire et valider les variables d'environnement requises. Échec
 *    explicite avec `process.exit(1)` si une variable critique
 *    manque — le message indique précisément quoi faire.
 * 2. Composer un `createServer()` avec la DB, le secret d'auth et le
 *    port demandés.
 * 3. Enregistrer les modules officiels (V1 : uniquement
 *    `hello-world`) dans le `PluginLoader` puis `loadAll()`.
 * 4. Brancher un `Client` discord.js (si `VARDE_DISCORD_TOKEN` est
 *    fourni) via `attachDiscordClient`. Sur `guild.join` (mapping de
 *    `guildCreate`), insérer la guild dans la table `guilds` et
 *    activer hello-world — le seed manuel `VARDE_SEED_GUILD_IDS`
 *    devient un fallback pour le dev hors-Discord.
 * 5. `.start()` l'API Fastify, brancher SIGINT / SIGTERM sur un
 *    shutdown gracieux (détache les listeners discord.js, destroy
 *    le Client, puis `handle.stop()`).
 *
 * Hors scope V1 : Redis (BullMQ, cache, pub/sub — mode dégradé ADR
 * 0003). Enregistrement programmatique des slash commands Discord
 * via l'API REST : à livrer quand la surface commandes sera stable.
 */

import { attachDiscordClient } from '@varde/bot';
import type { GuildId, Logger, ModuleId } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { pgSchema, sqliteSchema } from '@varde/db';
import { helloWorld } from '@varde/module-hello-world';
import { Client, GatewayIntentBits } from 'discord.js';

import { createServer } from './server.js';

type ServerHandle = Awaited<ReturnType<typeof createServer>>;

const HELLO_WORLD_ID = 'hello-world' as ModuleId;

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

const readOptionalRaw = (name: string): string | null => {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
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

async function upsertGuild(
  handle: ServerHandle,
  id: string,
  name: string,
  logger: Logger,
): Promise<void> {
  const client = handle.client;
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
        .values({ id, name })
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
        .values({ id, name })
        .onConflictDoNothing()
        .run();
    }
  } catch (error) {
    logger.warn('upsert guild échoué', {
      err: error instanceof Error ? error.message : String(error),
      guildId: id,
    });
  }
}

async function enableHelloWorldOn(
  handle: ServerHandle,
  guildId: string,
  logger: Logger,
): Promise<void> {
  try {
    await handle.loader.enable(guildId as GuildId, HELLO_WORLD_ID);
  } catch (error) {
    logger.warn('enable hello-world échoué', {
      err: error instanceof Error ? error.message : String(error),
      guildId,
    });
  }
}

async function seedFromEnv(
  handle: ServerHandle,
  ids: readonly string[],
  logger: Logger,
): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    await upsertGuild(handle, id, `seed-${id}`, logger);
    await enableHelloWorldOn(handle, id, logger);
  }
  logger.info('seed guilds depuis env appliqué', { count: ids.length });
}

/**
 * Abonne un handler `guild.join` sur l'EventBus : chaque fois que
 * discord.js pousse un `guildCreate` (via `attachDiscordClient` →
 * `mapDiscordEvent` → `guild.join`), on s'assure que la guild est
 * présente en base et que hello-world y est activé. C'est la version
 * runtime de `VARDE_SEED_GUILD_IDS` : dès que le bot est invité sur
 * un serveur, il y est opérationnel sans intervention manuelle.
 */
function subscribeAutoOnboard(handle: ServerHandle, logger: Logger): () => void {
  return handle.eventBus.on('guild.join', async (event) => {
    await upsertGuild(handle, event.guildId, event.guildId, logger);
    await enableHelloWorldOn(handle, event.guildId, logger);
    logger.info('guild rejointe, hello-world activé', { guildId: event.guildId });
  });
}

interface DiscordAttachment {
  readonly client: Client;
  readonly detach: () => void;
}

async function attachDiscord(
  handle: ServerHandle,
  token: string,
  logger: Logger,
): Promise<DiscordAttachment> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  // Ready : on rattrape les guilds déjà présentes (le bot a pu être
  // invité avant que ce process tourne). `guildCreate` ne refire pas
  // sur reconnexion pour les guilds existantes — ce handler fait le
  // pont.
  client.once('ready', async (readyClient) => {
    const guilds = [...readyClient.guilds.cache.values()];
    logger.info('Client Discord ready', { tag: readyClient.user.tag, guilds: guilds.length });
    for (const guild of guilds) {
      await upsertGuild(handle, guild.id, guild.name, logger);
      await enableHelloWorldOn(handle, guild.id, logger);
    }
  });

  const { detach } = attachDiscordClient(client, handle.dispatcher, logger);

  await client.login(token);

  return { client, detach };
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
  const discordToken = readOptionalRaw('VARDE_DISCORD_TOKEN');

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

  const unsubscribeAutoOnboard = subscribeAutoOnboard(handle, logger);

  await seedFromEnv(handle, seedIds, logger);

  let discord: DiscordAttachment | null = null;
  if (discordToken !== null) {
    discord = await attachDiscord(handle, discordToken, logger);
  } else {
    logger.warn(
      'VARDE_DISCORD_TOKEN absent : la gateway Discord ne sera pas connectée. L API HTTP reste disponible pour le dashboard. Renseigner le token dans .env.local pour activer le bot.',
    );
  }

  const { address } = await handle.start();
  logger.info('varde-server démarré', {
    address,
    driver,
    seedCount: seedIds.length,
    discord: discord !== null,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('varde-server : shutdown demandé', { signal });
    try {
      if (discord !== null) {
        discord.detach();
        await discord.client.destroy();
      }
      unsubscribeAutoOnboard();
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
