import { randomBytes } from 'node:crypto';

import {
  type Authenticator,
  buildAiProviderForGuild,
  createApiServer,
  createDiscordClient,
  createJwtAuthenticator,
  type DiscordClient,
  type DiscordStatusSnapshot,
  type GuildRoleDto,
  type GuildTextChannelDto,
  type OnboardingActionContextFactory,
  reconcileOnboardingSessions,
  registerAdminDiscordRoutes,
  registerAdminIdentityRoutes,
  registerAdminOverviewRoutes,
  registerAdminOwnershipRoutes,
  registerAdminUrlsRoutes,
  registerAiSettingsRoutes,
  registerAllowedHostsRoutes,
  registerAuditRoutes,
  registerBotSettingsRoutes,
  registerDiscordChannelsRoutes,
  registerDiscordEmojisRoutes,
  registerGuildsRoutes,
  registerInternalCredentialsRoutes,
  registerLogsRoutes,
  registerModulePermissionsRoutes,
  registerModulesRoutes,
  registerOnboardingRoutes,
  registerPermissionsRoutes,
  registerReactionRolesRoutes,
  registerSetupRoutes,
  registerUnboundPermissionsRoutes,
  registerUserPreferencesRoutes,
  registerWelcomeRoutes,
  type WelcomeUploadsService,
} from '@varde/api';
import type { BotDispatcher, CommandRegistry, OnboardingDiscordBridge } from '@varde/bot';
import { createCommandRegistry, createDispatcher } from '@varde/bot';
import type {
  ActionId,
  AIService,
  DiscordService,
  EventBus,
  GuildId,
  Logger,
  ModuleId,
  PermissionId,
  RoleId,
  UserId,
} from '@varde/contracts';
import { readBotSettings } from '@varde/contracts';
import {
  CORE_ACTIONS,
  type CoreAuditService,
  type CoreConfigService,
  type CorePermissionService,
  type CoreSchedulerService,
  type CtxBundle,
  createAuditService,
  createConfigService,
  createCtxFactory,
  createEventBus,
  createGuildPermissionsService,
  createInstanceAuditService,
  createInstanceConfigService,
  createKeystoreService,
  createLogger,
  createOnboardingExecutor,
  createOnboardingHostService,
  createOwnershipService,
  createPermissionService,
  createPluginLoader,
  createSchedulerService,
  createUserPreferencesService,
  type DiscordReconnectService,
  type GuildPermissionsContext,
  type GuildPermissionsService,
  type I18nMessages,
  type InstanceConfigService,
  type OnboardingExecutor,
  type OnboardingHostService,
  type OwnershipService,
  type PluginLoader,
} from '@varde/core';
import {
  applyMigrations,
  createDbClient,
  type DbClient,
  type DbDriver,
  pgSchema,
  sqliteSchema,
} from '@varde/db';
import { PRESET_CATALOG } from '@varde/presets';

type ApiServer = Awaited<ReturnType<typeof createApiServer>>;

/**
 * Insère (de manière idempotente) un pseudo-module dans
 * `modules_registry`. Utilisé pour les scopes internes (`core.ai`,
 * `core.onboarding`) qui ont besoin d'une FK `module_id` pour le
 * keystore et le scheduler mais qui ne sont pas des plugins chargés
 * par le loader — ils n'apparaissent pas dans `/guilds/:id/modules`.
 */
const ensurePseudoModuleRegistered = async <D extends DbDriver>(
  client: DbClient<D>,
  moduleId: string,
): Promise<void> => {
  if (client.driver === 'pg') {
    const pg = client as DbClient<'pg'>;
    await pg.db
      .insert(pgSchema.modulesRegistry)
      .values({ id: moduleId, version: '1.0.0', manifest: {}, schemaVersion: 0 })
      .onConflictDoNothing({ target: pgSchema.modulesRegistry.id });
    return;
  }
  const sqlite = client as DbClient<'sqlite'>;
  sqlite.db
    .insert(sqliteSchema.modulesRegistry)
    .values({ id: moduleId, version: '1.0.0', manifest: {}, schemaVersion: 0 })
    .onConflictDoNothing({ target: sqliteSchema.modulesRegistry.id })
    .run();
};

/**
 * Construit l'`AIService` exposé à `ctx.ai` pour une guild donnée.
 * Le `AIProvider` sous-jacent est résolu via `buildAiProviderForGuild`
 * de manière paresseuse (1ʳᵉ utilisation seulement) puis mémoïsé dans
 * la closure ; les rappels suivants delegate sans aller-retour DB.
 *
 * Seules les méthodes nécessaires au runtime moderation (`classify`)
 * sont implémentées concrètement. `complete` et `summarize` jettent
 * un `Error` non-implémenté — elles ne sont pas câblées par ailleurs
 * et un consommateur tiers est invité à passer par l'API
 * `apps/api/onboarding-ai-routes` pour `complete`/`generatePreset`.
 */
const createGuildAiService = (
  guildId: GuildId,
  config: CoreConfigService,
  keystore: ReturnType<typeof createKeystoreService>,
): AIService => {
  let providerPromise: Promise<{
    readonly classify: (text: string, labels: readonly string[]) => Promise<string>;
  }> | null = null;
  const getProvider = () => {
    if (providerPromise === null) {
      providerPromise = buildAiProviderForGuild({ config, keystore, guildId });
    }
    return providerPromise;
  };
  return {
    async classify(text, labels) {
      const provider = await getProvider();
      return provider.classify(text, labels);
    },
    async complete() {
      throw new Error('AIService.complete : non implémenté côté runtime moderation');
    },
    async summarize() {
      throw new Error('AIService.summarize : non implémenté côté runtime moderation');
    },
  };
};

/**
 * Paquet d'entrée monolith (ADR 0004) : compose @varde/core,
 * @varde/db, @varde/bot et @varde/api dans un même process Node avec
 * les mêmes instances de services. C'est ce process qui sera lancé
 * en prod avec `pnpm --filter @varde/server start`.
 *
 * `createServer(options)` renvoie un handle `{ start(), stop(),
 * api, dispatcher, loader, ... }`. Les tests d'intégration peuvent
 * construire un serveur sans lancer de listen() ni brancher de Client
 * discord.js — la gateway Discord réelle est optionnelle et arrivera
 * dès que `VARDE_DISCORD_TOKEN` sera fourni en entrée.
 */

export interface ServerDatabaseOptions<D extends DbDriver> {
  readonly driver: D;
  readonly url: string;
}

export interface ServerApiOptions {
  readonly port?: number;
  readonly host?: string;
  readonly corsOrigin?: string;
  readonly version?: string;
  /**
   * Authenticator à utiliser. Si omis et que `authSecret` est fourni,
   * on construit automatiquement un JWT authenticator HS256 depuis
   * le cookie. Au moins l'un des deux doit être passé.
   */
  readonly authenticator?: Authenticator;
  /** Secret partagé avec Auth.js pour la signature HS256 du JWT. */
  readonly authSecret?: string;
  /** Nom du cookie JWT. Défaut géré par createJwtAuthenticator. */
  readonly authCookieName?: string;
  /**
   * Client Discord injectable (tests). En prod par défaut, un client
   * avec `globalThis.fetch` est construit automatiquement.
   */
  readonly discord?: DiscordClient;
}

export interface ServerKeystoreOptions {
  readonly masterKey?: Buffer;
  readonly previousMasterKey?: Buffer;
}

export interface CreateServerOptions<D extends DbDriver> {
  readonly database: ServerDatabaseOptions<D>;
  readonly api: ServerApiOptions;
  readonly coreVersion?: string;
  readonly keystore?: ServerKeystoreOptions;
  readonly logger?: Logger;
  /** Skip applyMigrations (tests qui montent déjà une DB migrée). */
  readonly skipMigrations?: boolean;
  /**
   * Bridge onboarding vers un Client discord.js (PR 3.12d). Fourni :
   * les `core.createRole` / `createChannel` / `createCategory`
   * atteignent Discord en vrai. Omis : le serveur retombe sur un
   * bridge "demo" qui log sans toucher Discord, utile en CI ou dev
   * sans `VARDE_DISCORD_TOKEN`.
   */
  readonly onboardingBridge?: OnboardingDiscordBridge;
  /**
   * Service de reconnexion gateway (jalon 7 PR 7.2 sub-livrable 5).
   * Quand fourni, `PUT /admin/discord/token` l'utilise pour swap le
   * token bot à chaud — un échec de reconnexion empêche la
   * persistance du nouveau token (rollback automatique). Absent en
   * test / CI.
   */
  readonly discordReconnect?: DiscordReconnectService;
  /**
   * Adaptateur Discord pour `guildPermissionsService` (jalon 7 PR
   * 7.3). Fourni par `bin.ts` à partir du holder du Client. Quand
   * absent, le service est construit avec un context « stub » qui
   * retourne tableaux vides — utile en CI / tests sans bot.
   */
  readonly guildPermissionsContext?: GuildPermissionsContext;
  /**
   * Fonction listant les salons texte Discord d'une guild. Fournie par
   * `bin.ts` lorsque le bot est connecté. Absente → les routes GET
   * /discord/text-channels et /discord/roles répondent 503.
   */
  readonly listGuildTextChannels?: (guildId: string) => Promise<readonly GuildTextChannelDto[]>;
  /** Fonction listant les rôles Discord d'une guild. Voir `listGuildTextChannels`. */
  readonly listGuildRoles?: (guildId: string) => Promise<readonly GuildRoleDto[]>;
  /**
   * Fonction listant les emojis custom visibles depuis une guild
   * (emojis du serveur courant + emojis des autres serveurs où le bot
   * est présent). Absente → la route GET /discord/emojis répond 503.
   */
  readonly listGuildEmojis?: (guildId: string) => Promise<{
    readonly current: readonly { id: string; name: string; animated: boolean }[];
    readonly external: readonly {
      id: string;
      name: string;
      animated: boolean;
      guildName: string;
    }[];
  }>;
  /**
   * Liste best-effort des membres d'une guild — utilisé par
   * `POST /guilds/:guildId/permissions/preview` (jalon 7 PR 7.3).
   * Absente → preview retourne `{ admins: [], moderators: [] }`.
   */
  readonly listGuildMembers?: (guildId: string) => Promise<
    readonly {
      readonly id: string;
      readonly username?: string;
      readonly avatarUrl?: string | null;
      readonly roleIds: readonly string[];
    }[]
  >;
  /**
   * Service de persistance des images de fond welcome/goodbye.
   * Câblé par `bin.ts` à partir de `VARDE_UPLOADS_DIR`. Omis → les
   * routes upload/delete/get répondent 503.
   */
  readonly welcomeUploads?: WelcomeUploadsService;
  /**
   * Service Discord concret câblé par `bin.ts` quand le token est
   * présent. Omis → `createCtxFactory` utilise son stub interne
   * (lève une erreur explicite si un module tente de l'appeler).
   */
  readonly discordService?: DiscordService;
  /**
   * Locales par module, indexées par `moduleId`. Chaque entrée est
   * un dict `{ locale: { key: message } }` (forme `I18nMessages`).
   * Permet à `ctx.i18n.t(key, params)` de résoudre la clé. Sans
   * mapping, le service retourne la clé brute (utile pour repérer
   * les chaînes manquantes mais inacceptable en prod).
   */
  readonly locales?: Readonly<Record<string, I18nMessages>>;
  /**
   * Locale par défaut utilisée par le i18n quand la guild n'en a
   * pas encore défini une via `core.bot-settings`. Défaut `'en'`
   * côté `createCtxFactory` ; le fallback est toujours `'en'`.
   */
  readonly defaultLocale?: string;
  /**
   * URL d'accès au dashboard. Sert au wizard de setup pour dériver
   * l'URI de redirection OAuth2 affichée à l'admin. Défaut
   * `http://localhost:3000` (mode local solo). En LAN ou prod,
   * passer la valeur effective lue depuis `VARDE_BASE_URL`.
   */
  readonly baseUrl?: string;
}

export interface ServerHandle<D extends DbDriver> {
  readonly api: ApiServer;
  readonly dispatcher: BotDispatcher;
  readonly loader: PluginLoader;
  readonly commandRegistry: CommandRegistry;
  readonly config: CoreConfigService;
  readonly audit: CoreAuditService;
  readonly permissions: CorePermissionService;
  readonly onboardingExecutor: OnboardingExecutor;
  readonly eventBus: EventBus;
  readonly client: DbClient<D>;
  readonly ctxBundle: CtxBundle;
  /** Service de configuration globale de l'instance (jalon 7 PR 7.1). */
  readonly instanceConfig: InstanceConfigService;
  /** Service de gestion des owners de l'instance (jalon 7 PR 7.2). */
  readonly ownership: OwnershipService;
  /** Service de permissions par-guild (jalon 7 PR 7.3). */
  readonly guildPermissions: GuildPermissionsService;
  /**
   * Pose le provider qui répond à `GET /admin/overview` pour les
   * champs `bot.connected` / `bot.latencyMs`. `apps/server/src/bin.ts`
   * l'appelle juste après `client.login()` avec une closure qui lit
   * `client.isReady()` + `client.ws.ping`. Avant l'appel, l'API
   * rapporte `connected: false`.
   */
  readonly setDiscordStatusProvider: (provider: () => DiscordStatusSnapshot) => void;
  readonly start: () => Promise<{ readonly address: string }>;
  readonly stop: () => Promise<void>;
}

/**
 * Assemble un serveur monolith. Le handle retourné laisse l'API
 * construite mais non démarrée — l'appelant décide quand `.start()`
 * (ce qui permet aux tests d'utiliser `.api.inject()` sans listen).
 */
export async function createServer<D extends DbDriver>(
  options: CreateServerOptions<D>,
): Promise<ServerHandle<D>> {
  const logger =
    options.logger ?? createLogger({ destination: { write: () => undefined }, level: 'fatal' });
  const coreVersion = options.coreVersion ?? '1.0.0';

  const client = createDbClient({ driver: options.database.driver, url: options.database.url });
  if (!options.skipMigrations) {
    await applyMigrations(client);
  }

  const eventBus = createEventBus({ logger });
  // Chaîne ConfigService → EventBus. À partir de là toute écriture
  // `setWith` déclenche `config.changed` sur le bus in-process — les
  // abonnés (audit ci-dessous, modules, etc.) réagissent sans que la
  // route d écriture ait à s en préoccuper.
  const config = createConfigService({
    client,
    onChanged: async (event) => {
      await eventBus.emit(event);
    },
  });
  const permissions = createPermissionService({
    client,
    resolveMemberContext: async () => null,
  });

  // Onboarding executor + hôte `ctx.onboarding`. Construits avant le
  // ctx factory pour que les modules chargés par le loader puissent
  // contribuer des actions / hints dès leur `onLoad` (PR 3.13).
  const onboardingExecutor = createOnboardingExecutor({ client, logger });
  for (const action of CORE_ACTIONS) {
    onboardingExecutor.registerAction(
      action as Parameters<typeof onboardingExecutor.registerAction>[0],
    );
  }
  const onboardingHost: OnboardingHostService = createOnboardingHostService({
    executor: onboardingExecutor,
  });

  // Keystore IA + factory AIService par-guild. Le keystore lit/écrit
  // les clés API chiffrées (`core.ai.providerApiKey`). La factory
  // résout pour chaque guild un `AIService` minimaliste qui delegate
  // à un `AIProvider` lazy-construit via `buildAiProviderForGuild` ;
  // le provider lui-même est mémoïsé par `AIService` pour ne pas
  // refaire d'aller-retour DB à chaque message classifié.
  //
  // Les `AIService` sont cachés par `guildId` et invalidés à chaque
  // `config.changed` scope `modules.core.ai` ou `modules.ai`
  // (l'admin a édité son provider depuis `/settings/ai`).
  const aiModuleId = 'core.ai' as ModuleId;
  await ensurePseudoModuleRegistered(client, aiModuleId);
  // Master key partagée entre `aiKeystore` et `instanceConfig` — les deux
  // chiffrent avec AES-256-GCM via le même contrat. Si l'appelant n'a
  // pas fourni de clé (cas tests qui n'exercent pas le chiffrement),
  // on en génère une aléatoire stable pour la durée de vie du serveur.
  const masterKey = options.keystore?.masterKey ?? randomBytes(32);
  const aiKeystore = createKeystoreService({
    client,
    moduleId: aiModuleId,
    masterKey,
    ...(options.keystore?.previousMasterKey
      ? { previousMasterKey: options.keystore.previousMasterKey }
      : {}),
  });

  // Service de configuration globale de l'instance (jalon 7 PR 7.1).
  // Lecture du `setup_completed_at` au boot, écriture par les routes
  // `/setup/*`, déclencheur de l'event `instance.ready` à la fin du
  // wizard.
  const instanceConfig = createInstanceConfigService({
    client,
    masterKey,
    logger,
  });

  // Journal d'audit des événements scope-instance (rotation token,
  // ajout/retrait owner, changement URL, etc.). Service séparé du
  // `auditService` guild-scoped pour préserver la FK `audit_log →
  // guilds`. Cf. ADR / `instance_audit_log` schema.
  const instanceAudit = createInstanceAuditService({ client });

  // Service de gestion des owners de l'instance (jalon 7 PR 7.2).
  // Consommé par le hook Auth.js (claim-first), le middleware
  // `requireOwner` côté API, et les routes admin de gestion.
  const ownership = createOwnershipService({ client });

  // Provider de statut Discord pour `GET /admin/overview` — câblé
  // par `apps/server/src/bin.ts` après `client.login()` via
  // `handle.setDiscordStatusProvider(...)`. Tant que rien n'a été
  // posé, le provider rapporte « disconnected, latency null » pour
  // ne pas mentir avant que le bot ait vraiment ouvert sa
  // connexion gateway.
  let discordStatusProvider: () => DiscordStatusSnapshot = () => ({
    connected: false,
    latencyMs: null,
  });

  const aiServiceCache = new Map<GuildId, ReturnType<typeof createGuildAiService>>();
  const aiFactory = (guildId: GuildId) => {
    let svc = aiServiceCache.get(guildId);
    if (!svc) {
      svc = createGuildAiService(guildId, config, aiKeystore);
      aiServiceCache.set(guildId, svc);
    }
    return svc;
  };
  // Invalidation cache IA à chaque changement de config IA d'une guild.
  // On évite de purger toutes les guilds — le cache est par-guild,
  // seul l'event `core.ai` (scope `modules.ai`) compte.
  eventBus.on('config.changed', (event) => {
    aiServiceCache.delete(event.guildId);
  });

  // Cache des locales effectives par guild. Source de vérité :
  // `core.bot-settings.language` (édité depuis `/guilds/<id>/settings/bot`).
  // Le cache est rafraîchi à chaque `config.changed` ; la première
  // résolution d'une guild inconnue déclenche un fetch async — `null`
  // jusqu'à ce que le cache soit peuplé, ce qui fait retomber
  // `ctx.i18n.t` sur `defaultLocale` le temps que ça arrive.
  const guildLocales = new Map<GuildId, string>();
  const loadGuildLocale = async (guildId: GuildId): Promise<void> => {
    try {
      const snapshot = await config.get(guildId);
      const settings = readBotSettings(snapshot);
      guildLocales.set(guildId, settings.language);
    } catch {
      // NotFoundError ou autre échec → on laisse le cache vide ; le
      // prochain accès déclenchera un nouvel essai.
    }
  };
  eventBus.on('config.changed', async (event) => {
    await loadGuildLocale(event.guildId);
  });

  const ctxBundle = createCtxFactory({
    client,
    loggerRoot: logger,
    eventBus,
    config,
    permissions,
    keystoreMasterKey: options.keystore?.masterKey ?? randomBytes(32),
    onboarding: onboardingHost.service,
    ...(options.keystore?.previousMasterKey
      ? { keystorePreviousMasterKey: options.keystore.previousMasterKey }
      : {}),
    ...(options.discordService !== undefined ? { discord: options.discordService } : {}),
    ...(options.locales !== undefined ? { locales: options.locales } : {}),
    ...(options.defaultLocale !== undefined ? { defaultLocale: options.defaultLocale } : {}),
    aiFactory,
    getGuildLocale: (guildId) => {
      const cached = guildLocales.get(guildId);
      if (cached !== undefined) return cached;
      void loadGuildLocale(guildId);
      return null;
    },
  });

  const loader = createPluginLoader({
    coreVersion,
    logger,
    ctxFactory: ctxBundle.factory,
    // Persiste module + permissions dans la DB au chargement.
    // Ordre FK : upsert `modules_registry` d'abord (sinon la FK
    // `permissions_registry.module_id` viole), puis `permissions_registry`
    // (sinon la FK `permission_bindings.permission_id` viole au premier
    // onboarding apply — ADR 0008).
    persistModuleRegistration: async ({ moduleId, version, manifest, permissions: perms }) => {
      if (client.driver === 'pg') {
        const pg = client as DbClient<'pg'>;
        await pg.db
          .insert(pgSchema.modulesRegistry)
          .values({ id: moduleId, version, manifest, schemaVersion: manifest.schemaVersion })
          .onConflictDoUpdate({
            target: pgSchema.modulesRegistry.id,
            set: { version, manifest, schemaVersion: manifest.schemaVersion },
          });
      } else {
        const sqlite = client as DbClient<'sqlite'>;
        sqlite.db
          .insert(sqliteSchema.modulesRegistry)
          .values({ id: moduleId, version, manifest, schemaVersion: manifest.schemaVersion })
          .onConflictDoUpdate({
            target: sqliteSchema.modulesRegistry.id,
            set: { version, manifest, schemaVersion: manifest.schemaVersion },
          })
          .run();
      }
      if (perms.length > 0) {
        await permissions.registerPermissions(perms);
      }
    },
  });
  const commandRegistry = createCommandRegistry();

  const dispatcher = createDispatcher({
    eventBus,
    commandRegistry,
    ctxFactory: (ref) => ctxBundle.factory(ref),
    logger,
    // `loader` expose `isEnabled(moduleId, guildId)` — defense in
    // depth contre une commande dont le module est désactivé runtime
    // mais reste cachée côté Discord.
    enablementCheck: { isEnabled: (m, g) => loader.isEnabled(m, g) },
  });

  const authenticator: Authenticator =
    options.api.authenticator ??
    (options.api.authSecret
      ? createJwtAuthenticator({
          secret: options.api.authSecret,
          ...(options.api.authCookieName ? { cookieName: options.api.authCookieName } : {}),
        })
      : (() => {
          throw new Error('createServer : api.authenticator ou api.authSecret est requis');
        })());

  const discord = options.api.discord ?? createDiscordClient();

  const api = await createApiServer({
    logger,
    version: options.api.version ?? coreVersion,
    authenticator,
    ...(options.api.corsOrigin !== undefined ? { corsOrigin: options.api.corsOrigin } : {}),
  });

  const audit = createAuditService({ client });

  // Service de permissions par-guild (jalon 7 PR 7.3). Le context
  // adapter Discord est fourni par `bin.ts` ; en son absence on
  // pose un stub neutre qui ne donne aucun accès — adapté aux
  // tests / CI sans bot. Cache LRU 60 s pour les lectures hot
  // path (`getUserLevel` appelé sur chaque route gardée).
  const guildPermissionsContext: GuildPermissionsContext = options.guildPermissionsContext ?? {
    getAdminRoleIds: async () => [],
    getOwnerId: async () => null,
    getUserRoleIds: async () => [],
  };
  const guildPermissions: GuildPermissionsService = createGuildPermissionsService({
    client,
    context: guildPermissionsContext,
    audit,
    cache: { maxSize: 1000, ttlMs: 60_000 },
  });

  // Préférences utilisateur (jalon 7 PR 7.4.1). Cache mémoire court
  // — les préférences sont lues à chaque navigation dashboard, mais
  // changent rarement. Invalidation immédiate côté service à
  // l'écriture.
  const userPreferences = createUserPreferencesService({
    client,
    cache: { maxSize: 1000, ttlMs: 60_000 },
  });

  // Subscriber global : toute `config.changed` émise sur le bus
  // devient une entrée `core.config.updated` dans l audit log. On
  // évite ainsi l audit inline par route (dette PR 2.10) et on
  // capture automatiquement les futures écritures config, y compris
  // celles initiées par un module ou l onboarding (jalon 3).
  eventBus.on('config.changed', async (event) => {
    await audit.log({
      guildId: event.guildId,
      action: 'core.config.updated' as ActionId,
      actor:
        event.updatedBy !== null && event.updatedBy !== undefined
          ? { type: 'user', id: event.updatedBy }
          : { type: 'system' },
      severity: 'info',
      metadata: {
        scope: event.scope,
        versionBefore: event.versionBefore,
        versionAfter: event.versionAfter,
      },
    });
  });

  // Onboarding (jalon 3) : le `actionContextFactory` utilise le
  // bridge discord.js réel si `options.onboardingBridge` est fourni
  // (PR 3.12d). Sinon il retombe sur un bridge "demo" qui log sans
  // toucher Discord — utile en CI et dev hors-Discord. Le choix se
  // fait à la construction du handle : un même process reste sur un
  // mode pendant sa durée de vie. `resolveLocalId` est un stub
  // réinjecté par l'executor pendant `applyActions` (PR 3.12a), la
  // valeur posée ici n'est jamais consultée en chemin nominal.
  const onboardingBridge = options.onboardingBridge;
  const demoLoggerRoot = logger.child({ component: 'onboarding.demo' });

  const actionContextFactory: OnboardingActionContextFactory = ({ guildId, actorId }) => {
    const scopedLogger = logger.child({ component: 'onboarding', guildId, actorId });

    if (onboardingBridge) {
      return {
        guildId,
        actorId,
        logger: scopedLogger,
        discord: {
          createRole: (payload) => onboardingBridge.createRole(guildId, payload),
          deleteRole: (roleId) => onboardingBridge.deleteRole(guildId, roleId),
          createCategory: (payload) => onboardingBridge.createCategory(guildId, payload),
          deleteCategory: (channelId) => onboardingBridge.deleteCategory(guildId, channelId),
          createChannel: (payload) => onboardingBridge.createChannel(guildId, payload),
          deleteChannel: (channelId) => onboardingBridge.deleteChannel(guildId, channelId),
        },
        configPatch: async (patch) => {
          await config.setWith(guildId, patch, {
            scope: 'onboarding',
            updatedBy: actorId as UserId,
          });
        },
        resolveLocalId: () => null,
        permissions: {
          bind: (permissionId, roleId) =>
            permissions.bind(guildId, permissionId as PermissionId, roleId as RoleId),
          unbind: (permissionId, roleId) =>
            permissions.unbind(guildId, permissionId as PermissionId, roleId as RoleId),
        },
      };
    }

    // Fallback demo.
    let counter = 0;
    const nextId = (): string => {
      counter += 1;
      return `demo-${Date.now()}-${counter}`;
    };
    const demoLogger = demoLoggerRoot.child({ guildId, actorId });
    return {
      guildId,
      actorId,
      logger: scopedLogger,
      discord: {
        createRole: async (payload) => {
          const id = nextId();
          demoLogger.info('demo createRole', { id, name: payload.name });
          return { id };
        },
        deleteRole: async (roleId) => {
          demoLogger.info('demo deleteRole', { roleId });
        },
        createCategory: async (payload) => {
          const id = nextId();
          demoLogger.info('demo createCategory', { id, name: payload.name });
          return { id };
        },
        deleteCategory: async (channelId) => {
          demoLogger.info('demo deleteCategory', { channelId });
        },
        createChannel: async (payload) => {
          const id = nextId();
          demoLogger.info('demo createChannel', { id, name: payload.name, type: payload.type });
          return { id };
        },
        deleteChannel: async (channelId) => {
          demoLogger.info('demo deleteChannel', { channelId });
        },
      },
      configPatch: async (patch) => {
        await config.setWith(guildId, patch, {
          scope: 'onboarding',
          updatedBy: actorId as UserId,
        });
      },
      resolveLocalId: () => null,
      permissions: {
        bind: (permissionId, roleId) =>
          permissions.bind(guildId, permissionId as PermissionId, roleId as RoleId),
        unbind: (permissionId, roleId) =>
          permissions.unbind(guildId, permissionId as PermissionId, roleId as RoleId),
      },
    };
  };

  // Scheduler scopé au pseudo-module `core.onboarding` pour tenir les
  // jobs d'auto-expiration des sessions appliquées (PR 3.12b). Chaque
  // apply réussi pose un job one-shot à `expiresAt` ; chaque rollback
  // réussi annule le job correspondant. Au boot, `reconcileOnboardingSessions`
  // rattrape les jobs manqués pendant l'arrêt du process.
  const onboardingModuleId = 'core.onboarding' as ModuleId;
  await ensurePseudoModuleRegistered(client, onboardingModuleId);
  const schedulerLogger = logger.child({ component: 'scheduler.onboarding' });
  const onboardingScheduler: CoreSchedulerService = createSchedulerService({
    client,
    moduleId: onboardingModuleId,
    logger,
  });

  registerGuildsRoutes(api, { client, discord, guildPermissions });
  registerDiscordChannelsRoutes(api, {
    discord,
    // Réutilise le bridge onboarding pour la création de salon.
    // Absent si le bot n'est pas connecté (CI, dev sans token).
    ...(onboardingBridge
      ? {
          createGuildChannel: (guildId, payload) =>
            onboardingBridge.createChannel(guildId, { ...payload }),
        }
      : {}),
    ...(options.listGuildTextChannels
      ? { listGuildTextChannels: options.listGuildTextChannels }
      : {}),
    ...(options.listGuildRoles ? { listGuildRoles: options.listGuildRoles } : {}),
  });
  registerDiscordEmojisRoutes(api, {
    discord,
    ...(options.listGuildEmojis ? { listGuildEmojis: options.listGuildEmojis } : {}),
  });
  registerLogsRoutes(api, {
    discord,
    ...(options.discordService !== undefined ? { discordService: options.discordService } : {}),
  });
  registerReactionRolesRoutes(api, {
    discord,
    config,
    ...(options.discordService !== undefined ? { discordService: options.discordService } : {}),
  });
  registerWelcomeRoutes(api, {
    discord,
    config,
    ...(options.discordService !== undefined ? { discordService: options.discordService } : {}),
    ...(options.welcomeUploads !== undefined ? { uploads: options.welcomeUploads } : {}),
  });
  registerModulesRoutes(api, { loader, config, discord, guildPermissions });

  // Routes de configuration des permissions par-guild (jalon 7 PR
  // 7.3). Nécessitent un `listGuildRoles` enrichi (color, position,
  // memberCount) et un `listGuildMembers` pour le preview ; en
  // l'absence on tombe sur des stubs vides — la route GET reste
  // utilisable, le preview retourne juste `{ admins: [], moderators: [] }`.
  registerPermissionsRoutes(api, {
    guildPermissions,
    listGuildRoles: options.listGuildRoles ?? (async () => []),
    listGuildMembers: options.listGuildMembers ?? (async () => []),
  });
  // Préférences utilisateur (jalon 7 PR 7.4.1). `listKnownModuleIds`
  // utilise `loader.loadOrder()` — la liste des modules chargés sur
  // l'instance, indépendamment de leur état d'activation par-guild.
  registerUserPreferencesRoutes(api, {
    userPreferences,
    guildPermissions,
    listKnownModuleIds: () => loader.loadOrder() as readonly string[],
  });
  registerUnboundPermissionsRoutes(api, { loader, permissions, discord });
  registerModulePermissionsRoutes(api, { loader, permissions, discord });
  registerAuditRoutes(api, { audit, discord });
  registerAiSettingsRoutes(api, { config, keystore: aiKeystore, discord });
  registerBotSettingsRoutes(api, { config, discord });
  registerOnboardingRoutes(api, {
    client,
    discord,
    executor: onboardingExecutor,
    actionContextFactory,
    presetCatalog: PRESET_CATALOG,
    ai: { config, keystore: aiKeystore, logger },
    scheduler: onboardingScheduler,
    schedulerLogger,
    audit,
  });
  registerSetupRoutes(api, {
    instanceConfig,
    baseUrl: options.baseUrl ?? 'http://localhost:3000',
    client,
    masterKey,
  });
  // Endpoint interne `/internal/oauth-credentials` (jalon 7 PR 7.5) :
  // permet au dashboard de récupérer `clientId` + `clientSecret` Discord
  // déchiffrés depuis la DB, plutôt que via env. Le Bearer attendu est
  // `options.api.authSecret`, déjà partagé pour signer/lire les JWT.
  // En l'absence d'authSecret (cas tests qui injectent un Authenticator
  // custom), on n'enregistre pas la route — un dashboard qui voudrait
  // l'appeler recevrait 404, ce qui est cohérent avec un setup test-only.
  if (options.api.authSecret !== undefined) {
    registerInternalCredentialsRoutes(api, {
      instanceConfig,
      internalAuthSecret: options.api.authSecret,
      logger,
    });
  }
  registerAdminOwnershipRoutes(api, { ownership, instanceConfig, logger, instanceAudit });
  registerAdminIdentityRoutes(api, { ownership, instanceConfig, logger, instanceAudit });
  registerAdminDiscordRoutes(api, {
    ownership,
    instanceConfig,
    logger,
    instanceAudit,
    ...(options.discordReconnect ? { reconnect: options.discordReconnect } : {}),
  });
  registerAdminUrlsRoutes(api, {
    ownership,
    instanceConfig,
    logger,
    envBaseUrl: options.baseUrl ?? 'http://localhost:3000',
    instanceAudit,
  });
  registerAllowedHostsRoutes(api, {
    instanceConfig,
    envBaseUrl: options.baseUrl ?? 'http://localhost:3000',
  });
  registerAdminOverviewRoutes(api, {
    ownership,
    client,
    loader,
    version: coreVersion,
    // Le statut Discord live (connected + latency) est attaché par
    // `apps/server/src/bin.ts` après `client.login()` via
    // `setDiscordStatusProvider(...)` exposé sur le handle. Tant
    // qu'il n'a pas été câblé (CI, dev sans token, boot avant
    // login), on retombe sur le défaut « disconnected, latency null ».
    getDiscordStatus: () => discordStatusProvider(),
  });

  await reconcileOnboardingSessions({
    client,
    scheduler: onboardingScheduler,
    logger: schedulerLogger,
    audit,
  });

  const start = async (): Promise<{ readonly address: string }> => {
    onboardingScheduler.start();
    const address = await api.listen({
      port: options.api.port ?? 4000,
      host: options.api.host ?? '127.0.0.1',
    });
    return { address };
  };

  const stop = async (): Promise<void> => {
    onboardingScheduler.stop();
    await loader.unloadAll().catch(() => undefined);
    await api.close().catch(() => undefined);
    await ctxBundle.shutdown().catch(() => undefined);
    await client.close().catch(() => undefined);
  };

  return {
    api,
    dispatcher,
    loader,
    commandRegistry,
    config,
    audit,
    permissions,
    onboardingExecutor,
    eventBus,
    client,
    ctxBundle,
    instanceConfig,
    ownership,
    guildPermissions,
    setDiscordStatusProvider(provider) {
      discordStatusProvider = provider;
    },
    start,
    stop,
  };
}
