import { randomBytes } from 'node:crypto';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  createJwtAuthenticator,
  type DiscordClient,
  type OnboardingActionContextFactory,
  registerAiSettingsRoutes,
  registerAuditRoutes,
  registerGuildsRoutes,
  registerModulesRoutes,
  registerOnboardingRoutes,
} from '@varde/api';
import type { BotDispatcher, CommandRegistry } from '@varde/bot';
import { createCommandRegistry, createDispatcher } from '@varde/bot';
import type { ActionId, EventBus, Logger, ModuleId, UserId } from '@varde/contracts';
import {
  CORE_ACTIONS,
  type CoreAuditService,
  type CoreConfigService,
  type CorePermissionService,
  type CtxBundle,
  createAuditService,
  createConfigService,
  createCtxFactory,
  createEventBus,
  createKeystoreService,
  createLogger,
  createOnboardingExecutor,
  createPermissionService,
  createPluginLoader,
  type OnboardingExecutor,
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
 * Insère (de manière idempotente) le pseudo-module `core.ai` dans
 * `modules_registry` pour que le keystore scopé `core.ai` puisse
 * respecter la FK `keystore.module_id`. Ce pseudo-module n'est pas
 * chargé par le loader — il n'apparaît pas dans `/guilds/:id/modules`.
 */
const ensureCoreAiModuleRegistered = async <D extends DbDriver>(
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

  const ctxBundle = createCtxFactory({
    client,
    loggerRoot: logger,
    eventBus,
    config,
    permissions,
    keystoreMasterKey: options.keystore?.masterKey ?? randomBytes(32),
    ...(options.keystore?.previousMasterKey
      ? { keystorePreviousMasterKey: options.keystore.previousMasterKey }
      : {}),
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

  // Onboarding (jalon 3) : executor + routes builder. Le
  // `actionContextFactory` en V1 est un bridge "demo" qui simule
  // Discord — il génère des snowflakes faux et log les opérations.
  // Permet de tester le flow UI bout en bout avant que le bridge
  // discord.js réel soit posé (PR 3.13). Tant qu'on ne touche pas
  // Discord, rollback et apply sont totalement safe en prod.
  const onboardingExecutor = createOnboardingExecutor({ client, logger });
  for (const action of CORE_ACTIONS) {
    onboardingExecutor.registerAction(
      action as Parameters<typeof onboardingExecutor.registerAction>[0],
    );
  }

  const demoActionContextFactory: OnboardingActionContextFactory = ({ guildId, actorId }) => {
    let counter = 0;
    const nextId = (): string => {
      counter += 1;
      return `demo-${Date.now()}-${counter}`;
    };
    const demoLogger = logger.child({ component: 'onboarding.demo', guildId, actorId });
    return {
      guildId,
      actorId,
      logger: demoLogger,
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
    };
  };

  // Paramètres IA (jalon 3) : keystore scopé `core.ai` pour les
  // credentials, config non-sensible dans `guild_config`. Le
  // keystore référence modules_registry via FK, on y insère donc
  // un pseudo-module idempotent — il n'apparaît pas dans /modules
  // (ce dernier lit `loader.loadOrder()`, pas la table).
  const aiModuleId = 'core.ai' as ModuleId;
  await ensureCoreAiModuleRegistered(client, aiModuleId);
  const aiKeystore = createKeystoreService({
    client,
    moduleId: aiModuleId,
    masterKey: options.keystore?.masterKey ?? randomBytes(32),
    ...(options.keystore?.previousMasterKey
      ? { previousMasterKey: options.keystore.previousMasterKey }
      : {}),
  });

  registerGuildsRoutes(api, { client, discord });
  registerModulesRoutes(api, { loader, config, discord });
  registerAuditRoutes(api, { audit, discord });
  registerAiSettingsRoutes(api, { config, keystore: aiKeystore, discord });
  registerOnboardingRoutes(api, {
    client,
    discord,
    executor: onboardingExecutor,
    actionContextFactory: demoActionContextFactory,
    presetCatalog: PRESET_CATALOG,
    ai: { config, keystore: aiKeystore, logger },
  });

  const start = async (): Promise<{ readonly address: string }> => {
    const address = await api.listen({
      port: options.api.port ?? 4000,
      host: options.api.host ?? '127.0.0.1',
    });
    return { address };
  };

  const stop = async (): Promise<void> => {
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
