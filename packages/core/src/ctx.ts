import type {
  AIService,
  DiscordService,
  EventBus,
  I18nService,
  Logger,
  ModuleContext,
  ModuleId,
  ModulesService,
  OnboardingService,
  ScopedDatabase,
} from '@varde/contracts';
import type { DbClient, DbDriver } from '@varde/db';

import { type CoreAuditService, createAuditService } from './audit.js';
import type { CoreConfigService } from './config.js';
import { createI18n, type I18nMessages } from './i18n.js';
import { createKeystoreService } from './keystore.js';
import type { CtxFactory, ModuleRef } from './loader.js';
import type { CorePermissionService } from './permissions.js';
import { type CoreSchedulerService, createSchedulerService } from './scheduler.js';
import { createUIService } from './ui.js';

/**
 * `ctxFactory` assemble un `ModuleContext` conforme au contrat
 * `@varde/contracts` pour un module donné. Trois catégories de
 * services :
 *
 * - Partagés entre tous les modules : `logger` (racine), `events`,
 *   `config`, `permissions`, `discord`, `modules`, `ai`.
 * - Scopés par module (instanciés à la première demande et mémoïsés) :
 *   `audit`, `keystore`, `scheduler`, `i18n`.
 * - Marqueur : `db` (`ScopedDatabase`) reste un stub opaque en V1 ;
 *   le scoping effectif par préfixe de table viendra avec le vrai
 *   ScopedDatabase (post-V1).
 *
 * Le facteur expose un `shutdown()` qui arrête proprement les
 * schedulers instanciés. Les services Discord / Modules / AI sont
 * stubbés en V1 (Discord arrive en PR 1.6, Modules en PR 1.5+ une
 * fois que le loader est en place, AI post-V1).
 */

export interface CreateCtxFactoryOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly loggerRoot: Logger;
  readonly eventBus: EventBus;
  readonly config: CoreConfigService;
  readonly permissions: CorePermissionService;
  readonly keystoreMasterKey: Buffer;
  readonly keystorePreviousMasterKey?: Buffer;
  /** Service Discord injecté par le bot (PR 1.6). Stub si omis. */
  readonly discord?: DiscordService;
  /** Service inter-modules. Stub si omis. */
  readonly modules?: ModulesService;
  /** Service IA. `null` en V1 si aucun provider configuré. */
  readonly ai?: AIService | null;
  /**
   * Point d'extension onboarding pour les modules (PR 3.13). Permet
   * de `registerAction` (ajoute une action custom au registre de
   * l'executor) et `contributeHint` (suggestion déterministe pour
   * le builder). Stub si omis → les appels depuis un module
   * lèveront une erreur explicite (utile pour isoler des tests
   * unitaires qui n'ont pas besoin du moteur).
   */
  readonly onboarding?: OnboardingService;
  readonly defaultLocale?: string;
  readonly locales?: Readonly<Record<string, I18nMessages>>;
  readonly schedulerTickMs?: number;
  /** Horloge injectable partagée par tous les schedulers instanciés (tests). */
  readonly schedulerNow?: () => Date;
}

export interface CtxBundle {
  readonly factory: CtxFactory;
  /** Arrête les services scopés (schedulers). Idempotent. */
  readonly shutdown: () => Promise<void>;
}

const scopedDbStub: ScopedDatabase = Object.freeze({ __scoped: true });

const discordStub: DiscordService = Object.freeze({
  sendMessage: async () => {
    throw new Error('DiscordService non câblé (arrivée prévue PR 1.6)');
  },
  sendEmbed: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.sendEmbed` nécessite un host (apps/bot).',
    );
  },
  addReaction: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.addReaction` nécessite un host (apps/bot).',
    );
  },
  removeUserReaction: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.removeUserReaction` nécessite un host (apps/bot).',
    );
  },
  removeOwnReaction: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.removeOwnReaction` nécessite un host (apps/bot).',
    );
  },
  addMemberRole: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.addMemberRole` nécessite un host (apps/bot).',
    );
  },
  removeMemberRole: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.removeMemberRole` nécessite un host (apps/bot).',
    );
  },
  memberHasRole: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.memberHasRole` nécessite un host (apps/bot).',
    );
  },
  postMessage: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.postMessage` nécessite un host (apps/bot).',
    );
  },
  createRole: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.createRole` nécessite un host (apps/bot).',
    );
  },
  sendDirectMessage: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.sendDirectMessage` nécessite un host (apps/bot).',
    );
  },
  deleteMessage: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.deleteMessage` nécessite un host (apps/bot).',
    );
  },
  editMessage: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.editMessage` nécessite un host (apps/bot).',
    );
  },
  kickMember: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.kickMember` nécessite un host (apps/bot).',
    );
  },
  banMember: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.banMember` nécessite un host (apps/bot).',
    );
  },
  unbanMember: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.unbanMember` nécessite un host (apps/bot).',
    );
  },
  bulkDeleteMessages: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.bulkDeleteMessages` nécessite un host (apps/bot).',
    );
  },
  setChannelSlowmode: async () => {
    throw new Error(
      'DiscordService non câblé : `ctx.discord.setChannelSlowmode` nécessite un host (apps/bot).',
    );
  },
  getMemberCount: () => null,
  getUserDisplayInfo: async () => null,
  getGuildName: () => null,
  getRoleName: () => null,
});

const modulesStub: ModulesService = Object.freeze({
  query: async () => {
    throw new Error('ModulesService non câblé (stub V1)');
  },
  isEnabled: async () => false,
});

const onboardingStub: OnboardingService = Object.freeze({
  registerAction: () => {
    throw new Error(
      'OnboardingService non câblé : `ctx.onboarding.registerAction` nécessite un host qui expose un executor (apps/server).',
    );
  },
  contributeHint: () => {
    throw new Error(
      'OnboardingService non câblé : `ctx.onboarding.contributeHint` nécessite un host qui expose un hint registry (apps/server).',
    );
  },
});

export function createCtxFactory<D extends DbDriver>(
  options: CreateCtxFactoryOptions<D>,
): CtxBundle {
  const {
    client,
    loggerRoot,
    eventBus,
    config,
    permissions,
    keystoreMasterKey,
    keystorePreviousMasterKey,
    discord = discordStub,
    modules = modulesStub,
    ai = null,
    onboarding = onboardingStub,
    defaultLocale = 'en',
    locales = {},
    schedulerTickMs,
    schedulerNow,
  } = options;

  const ui = createUIService();
  const schedulers = new Map<ModuleId, CoreSchedulerService>();
  const audits = new Map<ModuleId, CoreAuditService>();
  const loggers = new Map<ModuleId, Logger>();
  const i18ns = new Map<ModuleId, I18nService>();
  const keystores = new Map<ModuleId, ReturnType<typeof createKeystoreService>>();

  const loggerFor = (moduleId: ModuleId): Logger => {
    const existing = loggers.get(moduleId);
    if (existing) return existing;
    const scoped = loggerRoot.child({ module: moduleId });
    loggers.set(moduleId, scoped);
    return scoped;
  };

  const schedulerFor = (moduleId: ModuleId): CoreSchedulerService => {
    const existing = schedulers.get(moduleId);
    if (existing) return existing;
    const instance = createSchedulerService({
      client,
      moduleId,
      logger: loggerFor(moduleId),
      ...(schedulerTickMs !== undefined ? { tickIntervalMs: schedulerTickMs } : {}),
      ...(schedulerNow ? { now: schedulerNow } : {}),
    });
    schedulers.set(moduleId, instance);
    return instance;
  };

  const auditFor = (moduleId: ModuleId): CoreAuditService => {
    const existing = audits.get(moduleId);
    if (existing) return existing;
    const instance = createAuditService({
      client,
      scope: { kind: 'module', moduleId },
    });
    audits.set(moduleId, instance);
    return instance;
  };

  const keystoreFor = (moduleId: ModuleId) => {
    const existing = keystores.get(moduleId);
    if (existing) return existing;
    const instance = createKeystoreService({
      client,
      moduleId,
      masterKey: keystoreMasterKey,
      ...(keystorePreviousMasterKey ? { previousMasterKey: keystorePreviousMasterKey } : {}),
    });
    keystores.set(moduleId, instance);
    return instance;
  };

  const i18nFor = (moduleId: ModuleId): I18nService => {
    const existing = i18ns.get(moduleId);
    if (existing) return existing;
    const instance = createI18n({
      messages: locales[moduleId] ?? {},
      locale: defaultLocale,
      fallbackLocale: 'en',
    });
    i18ns.set(moduleId, instance);
    return instance;
  };

  const factory: CtxFactory = (ref: ModuleRef, _guildId) => {
    const moduleId = ref.id;
    return Object.freeze<ModuleContext>({
      module: { id: moduleId, version: ref.version },
      logger: loggerFor(moduleId),
      config,
      db: scopedDbStub,
      events: eventBus,
      audit: auditFor(moduleId),
      permissions,
      discord,
      scheduler: schedulerFor(moduleId),
      i18n: i18nFor(moduleId),
      modules,
      keystore: keystoreFor(moduleId),
      ai,
      ui,
      onboarding,
    });
  };

  const shutdown = async (): Promise<void> => {
    for (const scheduler of schedulers.values()) {
      scheduler.stop();
    }
    schedulers.clear();
    audits.clear();
    loggers.clear();
    i18ns.clear();
    keystores.clear();
  };

  return { factory, shutdown };
}
