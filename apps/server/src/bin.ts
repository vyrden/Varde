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

import { resolve as resolvePath } from 'node:path';

import {
  createWelcomeUploadsService,
  type GuildRoleDto,
  type GuildTextChannelDto,
  readModuleEnabledOverride,
} from '@varde/api';
import {
  attachDiscordClient,
  createDiscordJsChannelSender,
  createDiscordService,
  createOnboardingDiscordBridge,
  type OnboardingDiscordBridge,
  registerSlashCommandsForGuild,
} from '@varde/bot';
import type { DiscordService, GuildId, Logger, ModuleId } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { pgSchema, sqliteSchema } from '@varde/db';
import { helloWorld } from '@varde/module-hello-world';
import { logs } from '@varde/module-logs';
import { moderation } from '@varde/module-moderation';
import { reactionRoles } from '@varde/module-reaction-roles';
import { welcome } from '@varde/module-welcome';
import { ChannelType, Client, GatewayIntentBits, Partials } from 'discord.js';

import { createServer } from './server.js';

type ServerHandle = Awaited<ReturnType<typeof createServer>>;

const HELLO_WORLD_ID = 'hello-world' as ModuleId;

/**
 * Modules activés par défaut sur toute guild connue. **Politique
 * V1 : seul `hello-world` est auto-activé** (témoin du contrat
 * core/module). Les modules officiels (`logs`, `moderation`,
 * `reaction-roles`, `welcome`) restent désactivés tant que l'admin
 * ne les active pas explicitement via le toggle du dashboard. C'est
 * un opt-in volontaire pour que l'admin garde la main sur ce qui
 * tourne sur son serveur.
 */
const DEFAULT_ENABLED_MODULES: readonly ModuleId[] = [HELLO_WORLD_ID];

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

/**
 * Lit la master key keystore depuis l'environnement. Fail fast si la
 * variable est vide ou mal formée — sans master key stable entre
 * redémarrages, toutes les clés chiffrées (API keys IA, secrets
 * modules) deviennent illisibles au prochain boot, ce qui casse
 * silencieusement le produit. Mieux vaut refuser de démarrer.
 *
 * Format attendu : 32 octets encodés en base64 (génération :
 * `openssl rand -base64 32`). L'utilisateur voit un message clair
 * si la valeur manque.
 */
const readKeystoreMasterKey = (): Buffer => {
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation on process.env
  const raw = process.env['VARDE_KEYSTORE_MASTER_KEY'];
  if (typeof raw !== 'string' || raw.length === 0) {
    return die(
      [
        'VARDE_KEYSTORE_MASTER_KEY est vide ou manquante.',
        '',
        'Sans cette clé, le keystore chiffre les secrets (clés API IA, etc.) avec une',
        'clé aléatoire différente à chaque démarrage — tous les secrets stockés',
        'deviennent illisibles au prochain boot.',
        '',
        'Génère-en une (32 octets base64) et ajoute-la à .env.local :',
        '  openssl rand -base64 32',
      ].join('\n'),
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    return die(
      `VARDE_KEYSTORE_MASTER_KEY doit décoder en 32 octets (reçu ${buf.length}). Regénère avec : openssl rand -base64 32`,
    );
  }
  return buf;
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

async function enableDefaultModulesOn(
  handle: ServerHandle,
  guildId: string,
  logger: Logger,
): Promise<void> {
  // Lit l'état persisté pour cette guild (overrides admins via UI).
  // Si vide ou erreur → fallback sur DEFAULT_ENABLED_MODULES.
  let snapshot: unknown = {};
  try {
    snapshot = await handle.config.get(guildId as GuildId);
  } catch {
    snapshot = {};
  }

  // Set des modules à appliquer en runtime, suivant les règles :
  //   override = true   → enable
  //   override = false  → ne PAS enable (admin a désactivé)
  //   override = null   → enable si dans DEFAULT_ENABLED_MODULES
  const candidates = new Set<ModuleId>(DEFAULT_ENABLED_MODULES);
  for (const moduleId of handle.loader.loadOrder()) {
    const override = readModuleEnabledOverride(snapshot, moduleId);
    if (override === true) candidates.add(moduleId);
    if (override === false) candidates.delete(moduleId);
  }

  for (const moduleId of candidates) {
    try {
      await handle.loader.enable(guildId as GuildId, moduleId);
    } catch (error) {
      logger.warn('enable module au boot échoué', {
        err: error instanceof Error ? error.message : String(error),
        guildId,
        moduleId,
      });
    }
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
    await enableDefaultModulesOn(handle, id, logger);
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
function subscribeAutoOnboard(
  handle: ServerHandle,
  logger: Logger,
  getDiscordClient: () => Client | null,
): () => void {
  return handle.eventBus.on('guild.join', async (event) => {
    await upsertGuild(handle, event.guildId, event.guildId, logger);
    await enableDefaultModulesOn(handle, event.guildId, logger);
    const client = getDiscordClient();
    if (client !== null) {
      await registerSlashCommandsForGuild(
        client,
        event.guildId,
        collectAllCommands(handle),
        logger,
      );
    }
    logger.info('guild rejointe, modules par défaut activés', { guildId: event.guildId });
  });
}

interface DiscordAttachment {
  readonly client: Client;
  readonly bridge: OnboardingDiscordBridge;
  /** Service Discord concret à passer à `createServer` via `discordService`. */
  readonly discordService: DiscordService;
  /** Liste les salons texte d'une guild depuis le cache discord.js. */
  readonly listGuildTextChannels: (guildId: string) => Promise<readonly GuildTextChannelDto[]>;
  /** Liste les rôles d'une guild depuis le cache discord.js. */
  readonly listGuildRoles: (guildId: string) => Promise<readonly GuildRoleDto[]>;
  /**
   * Liste les emojis custom visibles depuis une guild :
   * - `current` : emojis du serveur courant.
   * - `external` : emojis des autres serveurs où le bot est présent
   *   (utilisables par les utilisateurs Nitro côté Discord, et par le
   *   bot lui-même pour pré-réagir).
   */
  readonly listGuildEmojis: (guildId: string) => Promise<{
    readonly current: readonly { id: string; name: string; animated: boolean }[];
    readonly external: readonly {
      id: string;
      name: string;
      animated: boolean;
      guildName: string;
    }[];
  }>;
}

interface DiscordBinding {
  readonly detach: () => void;
  readonly destroy: () => Promise<void>;
}

/**
 * Instancie le Client discord.js + le bridge onboarding sans se
 * connecter. Le bridge peut être passé à `createServer()` même avant
 * `login()` : il résout les guilds lazy via le cache du Client, qui
 * est peuplé dès le `clientReady`. Séparer l'instantiation du login
 * permet à `createServer()` d'enregistrer les routes onboarding avec
 * un bridge vivant tout en gardant `.login()` sous le contrôle du
 * caller (bin.ts l'appelle après `attachDiscordToHandle`).
 *
 * Le `ChannelSender` concret est construit ici à partir du Client ;
 * il est wrappé dans un `DiscordService` (rate limiter + traçabilité)
 * et passé à `createServer` pour alimenter `ctx.discord` des modules.
 */
function createDiscordAttachment(logger: Logger): DiscordAttachment {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
    ],
    // Sans ces partials, discord.js ignore silencieusement les réactions
    // sur des objets pas en cache (cas typiques : message posté avant le
    // redémarrage du bot, utilisateur jamais vu récemment).
    partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember],
  });
  const bridge = createOnboardingDiscordBridge(client);
  const sender = createDiscordJsChannelSender(client);
  const discordService = createDiscordService({ sender, logger, client });

  const listGuildTextChannels = async (
    guildId: string,
  ): Promise<readonly GuildTextChannelDto[]> => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];
    // On préfère `guild.channels.fetch()` pour couvrir les cas où le cache
    // n'est pas encore peuplé (redémarrage rapide post-reconnexion).
    const channels = await guild.channels.fetch();
    return Array.from(channels.values())
      .filter(
        (ch): ch is NonNullable<typeof ch> => ch !== null && ch.type === ChannelType.GuildText,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((ch) => ({ id: ch.id, name: ch.name }));
  };

  const listGuildRoles = async (guildId: string): Promise<readonly GuildRoleDto[]> => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];
    const roles = await guild.roles.fetch();
    return Array.from(roles.values())
      .filter((r) => !r.managed && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name }));
  };

  const listGuildEmojis: DiscordAttachment['listGuildEmojis'] = async (guildId) => {
    const current: { id: string; name: string; animated: boolean }[] = [];
    const external: { id: string; name: string; animated: boolean; guildName: string }[] = [];
    for (const guild of client.guilds.cache.values()) {
      for (const emoji of guild.emojis.cache.values()) {
        if (emoji.id === null || emoji.name === null) continue;
        if (guild.id === guildId) {
          current.push({ id: emoji.id, name: emoji.name, animated: emoji.animated ?? false });
        } else {
          external.push({
            id: emoji.id,
            name: emoji.name,
            animated: emoji.animated ?? false,
            guildName: guild.name,
          });
        }
      }
    }
    current.sort((a, b) => a.name.localeCompare(b.name));
    external.sort((a, b) => a.guildName.localeCompare(b.guildName) || a.name.localeCompare(b.name));
    return { current, external };
  };

  return {
    client,
    bridge,
    discordService,
    listGuildTextChannels,
    listGuildRoles,
    listGuildEmojis,
  };
}

/**
 * Liste **toutes** les commandes du registry, indépendamment de
 * l'état d'activation per-guild. On les publie en bloc à Discord
 * au boot — l'admin voit les commandes des modules désactivés
 * (pattern MEE6), mais le routeur les refuse en defense-in-depth
 * tant que le module n'est pas activé. Trade-off : zéro latence
 * de toggle vs petite confusion possible sur les commandes vues.
 */
const collectAllCommands = (handle: ServerHandle) =>
  handle.commandRegistry.list().map((entry) => entry.command);

function attachDiscordToHandle(
  attachment: DiscordAttachment,
  handle: ServerHandle,
  logger: Logger,
): DiscordBinding {
  attachment.client.once('ready', async (readyClient) => {
    const guilds = [...readyClient.guilds.cache.values()];
    logger.info('Client Discord ready', { tag: readyClient.user.tag, guilds: guilds.length });
    const commands = collectAllCommands(handle);
    for (const guild of guilds) {
      await upsertGuild(handle, guild.id, guild.name, logger);
      await enableDefaultModulesOn(handle, guild.id, logger);
      // Enregistre toutes les slash commands à Discord pour cette
      // guild. Idempotent : remplace l'intégralité des commandes
      // côté Discord à chaque boot. Pas de re-register au toggle —
      // les modules désactivés sont rejetés par le router au runtime.
      await registerSlashCommandsForGuild(readyClient, guild.id, commands, logger);
    }
  });
  const { detach } = attachDiscordClient(attachment.client, handle.dispatcher, logger);
  return {
    detach,
    destroy: () => attachment.client.destroy(),
  };
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
  const keystoreMasterKey = readKeystoreMasterKey();
  const uploadsDir = resolvePath(readOptional('VARDE_UPLOADS_DIR', './uploads'));
  const welcomeUploads = createWelcomeUploadsService(uploadsDir);

  const logger = createLogger({ level: logLevel });

  // Le Client discord.js + son bridge onboarding sont instanciés
  // avant `createServer()` pour que les routes onboarding câblent
  // directement le vrai bridge (PR 3.12d). `.login()` est repoussé
  // jusqu'après `createServer()` pour que le dispatcher soit prêt à
  // recevoir les events gateway.
  const discordAttachment = discordToken !== null ? createDiscordAttachment(logger) : null;

  const driver = pickDriver(databaseUrl);
  const handle =
    driver === 'pg'
      ? await createServer({
          database: { driver: 'pg', url: databaseUrl },
          api: { port, host, corsOrigin, authSecret },
          keystore: { masterKey: keystoreMasterKey },
          logger,
          ...(discordAttachment ? { onboardingBridge: discordAttachment.bridge } : {}),
          ...(discordAttachment ? { discordService: discordAttachment.discordService } : {}),
          ...(discordAttachment
            ? { listGuildTextChannels: discordAttachment.listGuildTextChannels }
            : {}),
          ...(discordAttachment ? { listGuildRoles: discordAttachment.listGuildRoles } : {}),
          ...(discordAttachment ? { listGuildEmojis: discordAttachment.listGuildEmojis } : {}),
          welcomeUploads,
        })
      : await createServer({
          database: { driver: 'sqlite', url: databaseUrl },
          api: { port, host, corsOrigin, authSecret },
          keystore: { masterKey: keystoreMasterKey },
          logger,
          ...(discordAttachment ? { onboardingBridge: discordAttachment.bridge } : {}),
          ...(discordAttachment ? { discordService: discordAttachment.discordService } : {}),
          ...(discordAttachment
            ? { listGuildTextChannels: discordAttachment.listGuildTextChannels }
            : {}),
          ...(discordAttachment ? { listGuildRoles: discordAttachment.listGuildRoles } : {}),
          ...(discordAttachment ? { listGuildEmojis: discordAttachment.listGuildEmojis } : {}),
          welcomeUploads,
        });

  handle.loader.register(helloWorld);
  handle.loader.register(logs);
  handle.loader.register(moderation);
  handle.loader.register(reactionRoles);
  handle.loader.register(welcome);
  await handle.loader.loadAll();

  // Hydrate le `commandRegistry` du bot depuis les modules chargés.
  // Le loader ne fait pas ce câblage automatiquement (le registry
  // appartient à @varde/bot, pas au core) — c'est `bin.ts` qui
  // assemble. Sans ça, aucune slash command n'est routable et la
  // registration REST par-guild n'enverrait rien à Discord.
  for (const id of handle.loader.loadOrder()) {
    const def = handle.loader.get(id);
    if (def?.commands && Object.keys(def.commands).length > 0) {
      handle.commandRegistry.register(
        { id: def.manifest.id, version: def.manifest.version },
        def.commands,
      );
    }
  }

  let discord: DiscordBinding | null = null;
  const unsubscribeAutoOnboard = subscribeAutoOnboard(handle, logger, () =>
    discord !== null && discordAttachment !== null ? discordAttachment.client : null,
  );

  await seedFromEnv(handle, seedIds, logger);

  if (discordAttachment !== null && discordToken !== null) {
    discord = attachDiscordToHandle(discordAttachment, handle, logger);
    await discordAttachment.client.login(discordToken);
  } else {
    logger.warn(
      'VARDE_DISCORD_TOKEN absent : la gateway Discord ne sera pas connectée. L API HTTP reste disponible pour le dashboard. Le bridge onboarding retombe sur un mode demo (logs, pas d appels Discord). Renseigner le token dans .env.local pour activer le bot.',
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
        await discord.destroy();
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
