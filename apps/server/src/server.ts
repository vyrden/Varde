import { randomBytes } from 'node:crypto';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  createJwtAuthenticator,
  type DiscordClient,
  type GuildRoleDto,
  type GuildTextChannelDto,
  type OnboardingActionContextFactory,
  reconcileOnboardingSessions,
  registerAiSettingsRoutes,
  registerAuditRoutes,
  registerDiscordChannelsRoutes,
  registerGuildsRoutes,
  registerLogsRoutes,
  registerModulePermissionsRoutes,
  registerModulesRoutes,
  registerOnboardingRoutes,
  registerUnboundPermissionsRoutes,
} from '@varde/api';
import type { BotDispatcher, CommandRegistry, OnboardingDiscordBridge } from '@varde/bot';
import { createCommandRegistry, createDispatcher } from '@varde/bot';
import type {
  ActionId,
  DiscordService,
  EventBus,
  Logger,
  ModuleId,
  PermissionId,
  RoleId,
  UserId,
} from '@varde/contracts';
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
  createKeystoreService,
  createLogger,
  createOnboardingExecutor,
  createOnboardingHostService,
  createPermissionService,
  createPluginLoader,
  createSchedulerService,
  type OnboardingExecutor,
  type OnboardingHostService,
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
   * Fonction listant les salons texte Discord d'une guild. Fournie par
   * `bin.ts` lorsque le bot est connecté. Absente → les routes GET
   * /discord/text-channels et /discord/roles répondent 503.
   */
  readonly listGuildTextChannels?: (guildId: string) => Promise<readonly GuildTextChannelDto[]>;
  /** Fonction listant les rôles Discord d'une guild. Voir `listGuildTextChannels`. */
  readonly listGuildRoles?: (guildId: string) => Promise<readonly GuildRoleDto[]>;
  /**
   * Service Discord concret câblé par `bin.ts` quand le token est
   * présent. Omis → `createCtxFactory` utilise son stub interne
   * (lève une erreur explicite si un module tente de l'appeler).
   */
  readonly discordService?: DiscordService;
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
  });

  const loader = createPluginLoader({ coreVersion, logger, ctxFactory: ctxBundle.factory });
  const commandRegistry = createCommandRegistry();

  const dispatcher = createDispatcher({
    eventBus,
    commandRegistry,
    ctxFactory: (ref) => ctxBundle.factory(ref),
    logger,
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

  // Paramètres IA (jalon 3) : keystore scopé `core.ai` pour les
  // credentials, config non-sensible dans `guild_config`. Le
  // keystore référence modules_registry via FK, on y insère donc
  // un pseudo-module idempotent — il n'apparaît pas dans /modules
  // (ce dernier lit `loader.loadOrder()`, pas la table).
  const aiModuleId = 'core.ai' as ModuleId;
  await ensurePseudoModuleRegistered(client, aiModuleId);
  const aiKeystore = createKeystoreService({
    client,
    moduleId: aiModuleId,
    masterKey: options.keystore?.masterKey ?? randomBytes(32),
    ...(options.keystore?.previousMasterKey
      ? { previousMasterKey: options.keystore.previousMasterKey }
      : {}),
  });

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

  registerGuildsRoutes(api, { client, discord });
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
  registerLogsRoutes(api, {
    discord,
    ...(options.discordService !== undefined ? { discordService: options.discordService } : {}),
  });
  registerModulesRoutes(api, { loader, config, discord });
  registerUnboundPermissionsRoutes(api, { loader, permissions, discord });
  registerModulePermissionsRoutes(api, { loader, permissions, discord });
  registerAuditRoutes(api, { audit, discord });
  registerAiSettingsRoutes(api, { config, keystore: aiKeystore, discord });
  registerOnboardingRoutes(api, {
    client,
    discord,
    executor: onboardingExecutor,
    actionContextFactory,
    presetCatalog: PRESET_CATALOG,
    ai: { config, keystore: aiKeystore, logger },
    scheduler: onboardingScheduler,
    schedulerLogger,
  });

  await reconcileOnboardingSessions({
    client,
    scheduler: onboardingScheduler,
    logger: schedulerLogger,
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
    start,
    stop,
  };
}
