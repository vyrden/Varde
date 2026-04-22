import { randomBytes } from 'node:crypto';
import {
  type BotDispatcher,
  type CommandCtxFactory,
  type CommandPermissionsPort,
  type CommandRegistry,
  createCommandRegistry,
  createDispatcher,
  type DiscordEventInput,
} from '@varde/bot';
import type {
  CommandInteractionInput,
  CoreEvent,
  EventBus,
  GuildId,
  ModuleContext,
  ModuleDefinition,
  ModuleId,
  UIMessage,
  UserId,
} from '@varde/contracts';
import {
  CORE_ACTIONS,
  type CoreConfigService,
  type CorePermissionService,
  type CoreSchedulerService,
  type CtxBundle,
  type CtxFactory,
  createConfigService,
  createCtxFactory,
  createEventBus,
  createLogger,
  createOnboardingExecutor,
  createOnboardingHostService,
  createPermissionService,
  createPluginLoader,
  type OnboardingExecutor,
  type OnboardingHostService,
  type PermissionContext,
  type PluginLoader,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';

/**
 * `TestHarness` : monte un core + bot en mémoire pour les tests
 * d'intégration bout en bout d'un module. V1 utilise SQLite en
 * `:memory:` pour rester rapide (pas de Docker requis). Support
 * Postgres via Testcontainers envisageable post-V1.
 *
 * Le harness expose les leviers habituels :
 * - `loadModule(def)` enregistre le module puis loadAll() du loader.
 * - `enable(guildId, moduleId)` active le module sur une guild.
 * - `emitDiscord(input)` simule un événement Discord → CoreEvent via
 *   le dispatcher. `emitCore(event)` pousse directement un CoreEvent
 *   sur l'EventBus (utile pour des événements non générés par
 *   discord.js, ex. module.loaded).
 * - `runCommand(input)` dispatche une interaction de slash command
 *   et retourne le `UIMessage` produit.
 * - `advanceTime(ms)` avance l'horloge partagée par tous les
 *   schedulers ; `runScheduled(moduleId)` appelle runOnce() sur le
 *   scheduler du module pour exécuter les tâches dues.
 * - `setMemberContext(guildId, userId, ctx)` pré-alimente la
 *   résolution de contexte membre utilisée par le PermissionService.
 * - `close()` arrête les services et ferme la DB.
 */

export interface TestHarness {
  readonly client: DbClient<'sqlite'>;
  readonly eventBus: EventBus;
  readonly config: CoreConfigService;
  readonly permissions: CorePermissionService;
  readonly loader: PluginLoader;
  readonly ctxFactory: CtxFactory;
  readonly commandRegistry: CommandRegistry;
  readonly dispatcher: BotDispatcher;
  /**
   * Executor onboarding partagé avec `ctx.onboarding`. Les modules
   * peuvent lui contribuer des actions custom via `registerAction` ;
   * les tests peuvent directement le piloter via `applyActions` /
   * `undoSession` pour simuler un cycle sans passer par les routes.
   */
  readonly onboardingExecutor: OnboardingExecutor;
  /**
   * Host du service `ctx.onboarding`. Expose `getHints` /
   * `getContributedActionTypes` pour vérifier ce que les modules ont
   * contribué pendant leur onLoad.
   */
  readonly onboardingHost: OnboardingHostService;

  readonly loadModule: (definition: ModuleDefinition) => Promise<void>;
  readonly enable: (guildId: GuildId, moduleId: ModuleId) => Promise<void>;
  readonly disable: (guildId: GuildId, moduleId: ModuleId) => Promise<void>;
  readonly emitDiscord: (input: DiscordEventInput) => Promise<void>;
  readonly emitCore: (event: CoreEvent) => Promise<void>;
  readonly runCommand: (input: CommandInteractionInput) => Promise<UIMessage>;
  readonly advanceTime: (ms: number) => void;
  readonly now: () => Date;
  readonly runScheduled: (moduleId: ModuleId) => Promise<number>;
  readonly getScheduler: (moduleId: ModuleId) => CoreSchedulerService;
  readonly getCtx: (moduleId: ModuleId, guildId?: GuildId) => ModuleContext;
  readonly setMemberContext: (
    guildId: GuildId,
    userId: UserId,
    ctx: PermissionContext | null,
  ) => void;
  readonly close: () => Promise<void>;
}

export interface CreateTestHarnessOptions {
  readonly coreVersion?: string;
  readonly keystoreMasterKey?: Buffer;
  /** Guilds à pré-créer en base (insert dans `guilds`). Défaut : aucune. */
  readonly guilds?: readonly { readonly id: GuildId; readonly name?: string }[];
  /** Instant de départ du faux temps partagé. Défaut : maintenant. */
  readonly startTime?: Date;
  readonly defaultLocale?: string;
  readonly locales?: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
  >;
}

export async function createTestHarness(
  options: CreateTestHarnessOptions = {},
): Promise<TestHarness> {
  const coreVersion = options.coreVersion ?? '1.0.0';
  const keystoreMasterKey = options.keystoreMasterKey ?? randomBytes(32);

  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);

  for (const guild of options.guilds ?? []) {
    await client.db
      .insert(sqliteSchema.guilds)
      .values({ id: guild.id, name: guild.name ?? guild.id })
      .run();
  }

  const logger = createLogger({ destination: { write: () => undefined }, level: 'fatal' });
  const eventBus = createEventBus({ logger });
  const config = createConfigService({ client });

  // Résolveur de contexte membre alimenté via setMemberContext().
  const memberContexts = new Map<string, PermissionContext | null>();
  const memberKey = (guildId: GuildId, userId: UserId): string => `${guildId}:${userId}`;
  const permissions = createPermissionService({
    client,
    resolveMemberContext: async (guildId, userId) =>
      memberContexts.get(memberKey(guildId, userId)) ?? null,
  });

  // Faux temps partagé.
  let fakeNow = options.startTime ?? new Date();
  const now = (): Date => fakeNow;

  // Executor onboarding + hôte `ctx.onboarding` pré-alimenté avec
  // les actions core (createRole/Category/Channel, patchModuleConfig).
  // Les modules chargés via `loadModule()` peuvent ensuite contribuer
  // leurs propres actions via `ctx.onboarding.registerAction` (PR 3.13).
  const onboardingExecutor = createOnboardingExecutor({ client, logger });
  for (const action of CORE_ACTIONS) {
    onboardingExecutor.registerAction(
      action as Parameters<typeof onboardingExecutor.registerAction>[0],
    );
  }
  const onboardingHost: OnboardingHostService = createOnboardingHostService({
    executor: onboardingExecutor,
  });

  const bundle: CtxBundle = createCtxFactory({
    client,
    loggerRoot: logger,
    eventBus,
    config,
    permissions,
    keystoreMasterKey,
    schedulerNow: now,
    onboarding: onboardingHost.service,
    ...(options.defaultLocale ? { defaultLocale: options.defaultLocale } : {}),
    ...(options.locales ? { locales: options.locales } : {}),
  });

  const loader = createPluginLoader({
    coreVersion,
    logger,
    ctxFactory: bundle.factory,
  });

  const commandRegistry = createCommandRegistry();
  const commandCtxFactory: CommandCtxFactory = (ref) => bundle.factory(ref);
  const commandPermissions: CommandPermissionsPort = {
    async canInGuild(input, permission) {
      return permissions.canInGuild(input.guildId, { type: 'user', id: input.userId }, permission);
    },
  };
  const dispatcher = createDispatcher({
    eventBus,
    commandRegistry,
    ctxFactory: commandCtxFactory,
    logger,
    permissions: commandPermissions,
  });

  // Enregistre en base l'entrée modules_registry requise par les FK
  // des tables audit_log, permission_bindings, scheduled_tasks.
  const ensureRegistered = async (definition: ModuleDefinition): Promise<void> => {
    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values({
        id: definition.manifest.id,
        version: definition.manifest.version,
        manifest: definition.manifest,
        schemaVersion: definition.manifest.schemaVersion,
      })
      .onConflictDoUpdate({
        target: sqliteSchema.modulesRegistry.id,
        set: {
          version: definition.manifest.version,
          manifest: definition.manifest,
          schemaVersion: definition.manifest.schemaVersion,
        },
      });
  };

  const loadModule = async (definition: ModuleDefinition): Promise<void> => {
    await ensureRegistered(definition);
    loader.register(definition);
    if (definition.commands) {
      commandRegistry.register(
        { id: definition.manifest.id, version: definition.manifest.version },
        definition.commands,
      );
    }
    await loader.loadAll();
  };

  return {
    client,
    eventBus,
    config,
    permissions,
    loader,
    ctxFactory: bundle.factory,
    commandRegistry,
    dispatcher,
    onboardingExecutor,
    onboardingHost,

    loadModule,
    enable: (guildId, moduleId) => loader.enable(guildId, moduleId),
    disable: (guildId, moduleId) => loader.disable(guildId, moduleId),
    emitDiscord: (input) => dispatcher.dispatchEvent(input),
    emitCore: (event) => eventBus.emit(event),
    runCommand: (input) => dispatcher.dispatchCommand(input),
    advanceTime(ms) {
      fakeNow = new Date(fakeNow.getTime() + ms);
    },
    now,
    runScheduled: (moduleId) => {
      const ctx = bundle.factory({
        id: moduleId,
        version: loader.get(moduleId)?.manifest.version ?? '1.0.0',
      });
      return (ctx.scheduler as CoreSchedulerService).runOnce();
    },
    getScheduler(moduleId) {
      const ctx = bundle.factory({
        id: moduleId,
        version: loader.get(moduleId)?.manifest.version ?? '1.0.0',
      });
      return ctx.scheduler as CoreSchedulerService;
    },
    getCtx(moduleId, guildId) {
      const def = loader.get(moduleId);
      const version = def?.manifest.version ?? '1.0.0';
      return bundle.factory({ id: moduleId, version }, guildId);
    },
    setMemberContext(guildId, userId, ctx) {
      memberContexts.set(memberKey(guildId, userId), ctx);
    },
    async close() {
      await loader.unloadAll().catch(() => undefined);
      commandRegistry.unregister('' as ModuleId); // no-op; left for future
      await bundle.shutdown();
      await client.close();
    },
  };
}
