import { randomBytes } from 'node:crypto';

import { type Authenticator, createApiServer } from '@varde/api';
import type { BotDispatcher, CommandRegistry } from '@varde/bot';
import { createCommandRegistry, createDispatcher } from '@varde/bot';
import type { EventBus, Logger } from '@varde/contracts';
import {
  type CoreConfigService,
  type CorePermissionService,
  type CtxBundle,
  createConfigService,
  createCtxFactory,
  createEventBus,
  createLogger,
  createPermissionService,
  createPluginLoader,
  type PluginLoader,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, type DbDriver } from '@varde/db';

type ApiServer = Awaited<ReturnType<typeof createApiServer>>;

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
  /** Authenticator utilisé par l'API. Test : lit un header ; prod : décodera le cookie Auth.js en PR 2.4. */
  readonly authenticator: Authenticator;
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
  readonly permissions: CorePermissionService;
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
  const config = createConfigService({ client });
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

  const api = await createApiServer({
    logger,
    version: options.api.version ?? coreVersion,
    authenticator: options.api.authenticator,
    ...(options.api.corsOrigin !== undefined ? { corsOrigin: options.api.corsOrigin } : {}),
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
    permissions,
    eventBus,
    client,
    ctxBundle,
    start,
    stop,
  };
}
