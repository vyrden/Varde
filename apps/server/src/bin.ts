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
 * 4. Construire l'`instanceConfigService` (jalon 7 PR 7.1) à partir
 *    de la table singleton `instance_config`. Le statut de setup
 *    pilote la connexion Discord :
 *    - `setup_completed_at` non-NULL + token chiffré présent en DB →
 *      login avec ce token (chemin nominal post-wizard).
 *    - sinon mais `VARDE_DISCORD_TOKEN` env présent → login legacy
 *      (rétro-compatibilité dev pré-wizard).
 *    - sinon → on ne se connecte pas, on log un message qui pointe
 *      vers `${VARDE_BASE_URL}/setup`. Un listener `onReady` lance
 *      le login dès que le wizard appelle `complete()` — pas de
 *      redémarrage du process.
 * 5. Sur `guild.join` (mapping de `guildCreate`), insérer la guild
 *    dans la table `guilds` et activer hello-world — le seed manuel
 *    `VARDE_SEED_GUILD_IDS` devient un fallback pour le dev
 *    hors-Discord.
 * 6. `.start()` l'API Fastify, brancher SIGINT / SIGTERM sur un
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
  attachGuildPermissionsListeners,
  createDiscordJsChannelSender,
  createDiscordService,
  createOnboardingDiscordBridge,
  type DiscordClientHolder,
  type OnboardingDiscordBridge,
  registerSlashCommandsForGuild,
} from '@varde/bot';
import type { DiscordService, GuildId, Logger, ModuleId, UserId } from '@varde/contracts';
import { createDiscordReconnectService, createLogger } from '@varde/core';
import { pgSchema, sqliteSchema } from '@varde/db';
import { helloWorld, locales as helloWorldLocales } from '@varde/module-hello-world';
import { logs, locales as logsLocales } from '@varde/module-logs';
import { moderation } from '@varde/module-moderation';
import { reactionRoles, locales as reactionRolesLocales } from '@varde/module-reaction-roles';
import { welcome } from '@varde/module-welcome';
import { ChannelType, Client, GatewayIntentBits, Partials } from 'discord.js';

import { decideLoginPlan, resolveBaseUrl } from './boot.js';
import { createServer } from './server.js';

type ServerHandle = Awaited<ReturnType<typeof createServer>>;

const HELLO_WORLD_ID = 'hello-world' as ModuleId;

/**
 * Aggrégation des locales fournies par chaque module officiel,
 * indexée par `moduleId`. Passée à `createServer` qui la propage à
 * `createCtxFactory` pour que `ctx.i18n.t(key, params)` résolve les
 * chaînes depuis le bon dictionnaire. Les modules sans locales
 * (welcome, moderation V1) sont absents — le fallback i18n reste la
 * clé brute, mais ils n'utilisent pas `ctx.i18n.t` actuellement.
 */
const MODULE_LOCALES = {
  'hello-world': helloWorldLocales,
  logs: logsLocales,
  'reaction-roles': reactionRolesLocales,
} as const;

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
  /**
   * Holder mutable du Client courant — muté par le reconnect handler
   * (jalon 7 PR 7.2 sub-livrable 5). Tous les services (bridge,
   * sender, discordService, listers) lisent `holder.current` au
   * call-time, ils suivent donc le swap sans reconstruction.
   */
  readonly holder: DiscordClientHolder;
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
  /**
   * Liste best-effort des membres d'une guild depuis le cache
   * discord.js. Utilisé par le preview de la page permissions
   * (jalon 7 PR 7.3). Cache typiquement partiel — seuls les
   * membres ayant été touchés par un event sont chargés.
   */
  readonly listGuildMembers: (guildId: string) => Promise<
    readonly {
      readonly id: string;
      readonly username?: string;
      readonly avatarUrl?: string | null;
      readonly roleIds: readonly string[];
    }[]
  >;
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
/**
 * Construit un `Client` discord.js avec les intents/partials de
 * production. Factorise les paramètres pour que `createDiscordAttachment`
 * (boot) et le `discordReconnectService` (rotation à chaud) construisent
 * exactement le même client.
 */
function buildDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      // Nécessaire pour `messageCreate` / `messageUpdate` / `messageDelete`
      // — sans cet intent, l'automod et le module logs ne reçoivent
      // jamais d'événement message.
      GatewayIntentBits.GuildMessages,
      // Privileged intent à activer dans le portail Discord. Sans lui
      // les events `messageCreate` arrivent avec `content: ""`, ce qui
      // rend les règles automod textuelles (blacklist / regex / IA)
      // inutiles. Les règles `rate-limit` continuent de fonctionner.
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    // Sans ces partials, discord.js ignore silencieusement les réactions
    // sur des objets pas en cache (cas typiques : message posté avant le
    // redémarrage du bot, utilisateur jamais vu récemment).
    partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember],
  });
}

function createDiscordAttachment(logger: Logger): DiscordAttachment {
  const holder: DiscordClientHolder = { current: buildDiscordClient() };
  const bridge = createOnboardingDiscordBridge(holder);
  const sender = createDiscordJsChannelSender(holder);
  const discordService = createDiscordService({ sender, logger, client: holder });

  const listGuildTextChannels = async (
    guildId: string,
  ): Promise<readonly GuildTextChannelDto[]> => {
    const guild = holder.current.guilds.cache.get(guildId);
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
    const guild = holder.current.guilds.cache.get(guildId);
    if (!guild) return [];
    const roles = await guild.roles.fetch();
    return Array.from(roles.values())
      .filter((r) => !r.managed && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        // Couleur 0 = pas de couleur custom Discord. On omet le champ
        // dans ce cas pour que l'UI applique son fallback.
        ...(r.color !== 0 ? { color: r.color } : {}),
        position: r.position,
        memberCount: r.members.size,
      }));
  };

  const listGuildEmojis: DiscordAttachment['listGuildEmojis'] = async (guildId) => {
    const current: { id: string; name: string; animated: boolean }[] = [];
    const external: { id: string; name: string; animated: boolean; guildName: string }[] = [];
    for (const guild of holder.current.guilds.cache.values()) {
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

  const listGuildMembers: DiscordAttachment['listGuildMembers'] = async (guildId) => {
    const guild = holder.current.guilds.cache.get(guildId);
    if (!guild) return [];
    return Array.from(guild.members.cache.values()).map((member) => {
      const avatar = member.user.avatar ?? null;
      const avatarUrl =
        avatar !== null
          ? `https://cdn.discordapp.com/avatars/${member.user.id}/${avatar}.png?size=64`
          : null;
      return {
        id: member.user.id,
        username: member.user.username,
        avatarUrl,
        roleIds: [...member.roles.cache.keys()],
      };
    });
  };

  return {
    holder,
    bridge,
    discordService,
    listGuildTextChannels,
    listGuildRoles,
    listGuildEmojis,
    listGuildMembers,
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
  attachment.holder.current.once('ready', async (readyClient) => {
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
  // Status provider live pour `GET /admin/overview` (jalon 7 PR 7.2
  // sub-livrable 7d). Lit le Client courant via le holder à chaque
  // appel, donc suit les rotations de token sans reconstruction.
  // `ws.ping` vaut -1 tant que pas de heartbeat → on map sur null.
  handle.setDiscordStatusProvider(() => {
    const client = attachment.holder.current;
    const ready = client.isReady();
    const ping = client.ws.ping;
    return {
      connected: ready,
      latencyMs: ready && ping >= 0 ? ping : null,
    };
  });
  const { detach } = attachDiscordClient(
    attachment.holder.current,
    handle.dispatcher,
    logger,
    (input) => handle.ctxBundle.interactions.dispatchButton(input),
  );
  return {
    detach,
    destroy: () => attachment.holder.current.destroy(),
  };
}

async function main(): Promise<void> {
  const databaseUrl = readRequired('VARDE_DATABASE_URL');
  const authSecret = readRequired('VARDE_AUTH_SECRET');
  const port = parsePort(readOptional('VARDE_API_PORT', '4000'), 'VARDE_API_PORT');
  const host = readOptional('VARDE_API_HOST', '127.0.0.1');
  const baseUrl = resolveBaseUrl(process.env['VARDE_BASE_URL']);
  const logLevel = readOptional('VARDE_LOG_LEVEL', 'info') as
    | 'trace'
    | 'debug'
    | 'info'
    | 'warn'
    | 'error'
    | 'fatal';
  const seedIds = seedGuildIds(readOptional('VARDE_SEED_GUILD_IDS', ''));
  const envDiscordToken = readOptionalRaw('VARDE_DISCORD_TOKEN');
  const keystoreMasterKey = readKeystoreMasterKey();
  const uploadsDir = resolvePath(readOptional('VARDE_UPLOADS_DIR', './uploads'));
  const welcomeUploads = createWelcomeUploadsService(uploadsDir);

  const logger = createLogger({ level: logLevel });
  logger.info('VARDE_BASE_URL effective', { baseUrl });

  // Variables obsolètes depuis le jalon 7 PR 7.5 (ADR 0016) : les
  // credentials OAuth Discord ne se lisent plus depuis l'env, ils
  // viennent de `instance_config` (BDD chiffrée, alimentée par le
  // wizard). Si l'admin a un vieux `.env.local`, on l'avertit pour
  // qu'il les supprime — pas de crash, le code ne les lit plus de
  // toute façon.
  for (const obsolete of ['VARDE_DISCORD_CLIENT_ID', 'VARDE_DISCORD_CLIENT_SECRET'] as const) {
    if ((process.env[obsolete] ?? '').length > 0) {
      logger.warn(
        `${obsolete} est défini dans l'env mais n'est plus lu depuis le jalon 7 PR 7.5. Supprime cette variable de ton .env.local — la valeur saisie dans le wizard fait foi.`,
      );
    }
  }

  // Le Client discord.js + son bridge onboarding sont instanciés
  // sans login. Le bridge ne capture pas de `guildId` à la
  // construction et résout les guilds au call-time depuis le cache
  // discord.js — créer le Client avant `login()` est explicitement
  // supporté (cf. `apps/bot/src/onboarding-bridge.ts`). On peut donc
  // brancher la PR 7.1 « connexion différée jusqu'au wizard » sans
  // changer la composition de `createServer()`.
  const discordAttachment = createDiscordAttachment(logger);
  // `discord` est mis à jour à chaque attach/swap. Déclaré ici parce
  // que le handler `discordReconnect` (ci-dessous) doit le capturer
  // par closure pour atteindre le binding en cours, lui-même utilisé
  // par les routes admin via `createServer({ discordReconnect, ... })`.
  let discord: DiscordBinding | null = null;

  /**
   * Adaptateur Discord pour `guildPermissionsService` (jalon 7 PR
   * 7.3 sub-livrable 5). Lit le Client courant via le holder à
   * chaque appel — suit donc une rotation de token sans
   * reconstruction. Quand le bot n'est pas (encore) connecté ou
   * que la guild n'est pas en cache, on retombe sur des listes
   * vides — `getUserLevel` renverra `null`.
   */
  const guildPermissionsContext = {
    getAdminRoleIds: async (guildId: string): Promise<readonly string[]> => {
      const guild = discordAttachment.holder.current.guilds.cache.get(guildId);
      if (!guild) return [];
      return guild.roles.cache
        .filter((role) => role.permissions.has('Administrator'))
        .map((role) => role.id);
    },
    getOwnerId: async (guildId: string) => {
      const guild = discordAttachment.holder.current.guilds.cache.get(guildId);
      return (guild?.ownerId ?? null) as UserId | null;
    },
    getUserRoleIds: async (guildId: string, userId: string): Promise<readonly string[]> => {
      const guild = discordAttachment.holder.current.guilds.cache.get(guildId);
      if (!guild) return [];
      const member =
        guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
      if (!member) return [];
      return [...member.roles.cache.keys()];
    },
  };

  /**
   * Procédure de rotation à chaud du token bot Discord (jalon 7 PR
   * 7.2 sub-livrable 5).
   *
   * 1. Détache l'ancien dispatcher du Client en cours.
   * 2. Construit un nouveau `Client` discord.js et le pose dans
   *    `discordAttachment.holder.current` — bridge / sender /
   *    discordService / listers continuent de fonctionner sur ce
   *    nouveau client (ils résolvent depuis le holder à chaque appel).
   * 3. `client.login(newToken)` puis attend `clientReady`.
   * 4. Re-attache le dispatcher au nouveau client.
   * 5. Détruit gracefulement l'ancien client.
   *
   * Échec en cours de swap : restore le holder sur l'ancien client,
   * détruit le nouveau (qui a peut-être à moitié connecté), re-attache
   * le dispatcher à l'ancien, et propage l'erreur. Le mutex FIFO du
   * service empêche deux swaps concurrents.
   */
  const discordReconnect = createDiscordReconnectService({
    handler: async (newToken: string): Promise<void> => {
      const previousClient = discordAttachment.holder.current;
      const previousBinding = discord;
      if (previousBinding !== null) {
        previousBinding.detach();
        discord = null;
      }
      const newClient = buildDiscordClient();
      discordAttachment.holder.current = newClient;
      try {
        // `clientReady` (discord.js v15+) remplace l'ancien `ready`.
        // On configure les listeners avant `login()` pour ne pas
        // rater l'événement si le login est très rapide en CI/dev.
        const readyPromise = new Promise<void>((resolve, reject) => {
          const onReady = (): void => {
            newClient.off('error', onError);
            resolve();
          };
          const onError = (err: Error): void => {
            newClient.off('clientReady', onReady);
            reject(err);
          };
          newClient.once('clientReady', onReady);
          newClient.once('error', onError);
        });
        await newClient.login(newToken);
        await readyPromise;
      } catch (err) {
        // Rollback : remet l'ancien client dans le holder, détruit
        // le nouveau (peut être à moitié connecté), re-attache
        // l'ancien dispatcher si on l'avait détaché.
        discordAttachment.holder.current = previousClient;
        try {
          await newClient.destroy();
        } catch (destroyErr) {
          logger.warn('reconnect : destroy du nouveau client a échoué', {
            error: destroyErr instanceof Error ? destroyErr.message : String(destroyErr),
          });
        }
        if (previousBinding !== null) {
          discord = attachDiscordToHandle(discordAttachment, handle, logger);
        }
        throw err;
      }
      // Succès : ré-attache dispatcher + listeners permissions au
      // nouveau client, détruit l'ancien.
      discord = attachDiscordToHandle(discordAttachment, handle, logger);
      permissionListeners.detach();
      permissionListeners = attachGuildPermissionsListeners({
        client: newClient,
        service: handle.guildPermissions,
      });
      try {
        await previousClient.destroy();
      } catch (err) {
        logger.warn('reconnect : destroy de l ancien client a échoué', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    logger,
    timeoutMs: 30_000,
  });

  const driver = pickDriver(databaseUrl);
  const handle =
    driver === 'pg'
      ? await createServer({
          database: { driver: 'pg', url: databaseUrl },
          api: { port, host, corsOrigin: baseUrl, authSecret },
          keystore: { masterKey: keystoreMasterKey },
          logger,
          locales: MODULE_LOCALES,
          defaultLocale: 'fr',
          baseUrl,
          onboardingBridge: discordAttachment.bridge,
          discordService: discordAttachment.discordService,
          listGuildTextChannels: discordAttachment.listGuildTextChannels,
          listGuildRoles: discordAttachment.listGuildRoles,
          listGuildEmojis: discordAttachment.listGuildEmojis,
          listGuildMembers: discordAttachment.listGuildMembers,
          welcomeUploads,
          discordReconnect,
          guildPermissionsContext,
        })
      : await createServer({
          database: { driver: 'sqlite', url: databaseUrl },
          api: { port, host, corsOrigin: baseUrl, authSecret },
          keystore: { masterKey: keystoreMasterKey },
          logger,
          locales: MODULE_LOCALES,
          defaultLocale: 'fr',
          baseUrl,
          onboardingBridge: discordAttachment.bridge,
          discordService: discordAttachment.discordService,
          listGuildTextChannels: discordAttachment.listGuildTextChannels,
          listGuildRoles: discordAttachment.listGuildRoles,
          listGuildEmojis: discordAttachment.listGuildEmojis,
          listGuildMembers: discordAttachment.listGuildMembers,
          welcomeUploads,
          discordReconnect,
          guildPermissionsContext,
        });

  // Listeners Discord pour invalidation cache + auto-cleanup des
  // rôles supprimés (jalon 7 PR 7.3 sub-livrable 4). Branchés à
  // l'attachment courant — re-câblés sur le nouveau client à
  // chaque rotation de token (cf. handler `discordReconnect`).
  let permissionListeners = attachGuildPermissionsListeners({
    client: discordAttachment.holder.current,
    service: handle.guildPermissions,
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

  const unsubscribeAutoOnboard = subscribeAutoOnboard(handle, logger, () =>
    discord !== null ? discordAttachment.holder.current : null,
  );

  await seedFromEnv(handle, seedIds, logger);

  // Service `instance_config` (jalon 7 PR 7.1). Construit par
  // `createServer()` et exposé via le handle, ce qui garantit que
  // les routes `/setup/*` et le boot logic ci-dessous partagent la
  // même instance (et donc le même cache).
  const instanceConfig = handle.instanceConfig;
  const config = await instanceConfig.getConfig();
  const plan = decideLoginPlan({
    configured: config.setupCompletedAt !== null,
    dbToken: config.discordBotToken,
    envToken: envDiscordToken,
    baseUrl,
  });

  const performLogin = async (token: string): Promise<void> => {
    discord = attachDiscordToHandle(discordAttachment, handle, logger);
    await discordAttachment.holder.current.login(token);
  };

  if (plan.kind === 'db') {
    await performLogin(plan.token);
  } else if (plan.kind === 'env') {
    logger.warn(
      'VARDE_DISCORD_TOKEN env utilisé en mode legacy. Migrer via /setup pour persister le token chiffré en DB.',
    );
    await performLogin(plan.token);
  } else {
    logger.warn(plan.message);
  }

  // Listener qui prend le relais lorsque le wizard appelle `complete()`.
  // Idempotent côté service (no-op si la setup est déjà terminée), et
  // protégé ici par `discord !== null` au cas où l'instance serait
  // déjà loggée via le chemin legacy.
  const unsubscribeReady = instanceConfig.onReady(async () => {
    if (discord !== null) {
      return;
    }
    const updated = await instanceConfig.getConfig();
    if (updated.discordBotToken === null) {
      logger.error(
        'instance.ready : token Discord absent en DB malgré setup_completed_at, login impossible.',
      );
      return;
    }
    logger.info('instance.ready : démarrage de la connexion gateway Discord.');
    await performLogin(updated.discordBotToken);
  });

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
      permissionListeners.detach();
      unsubscribeReady();
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
