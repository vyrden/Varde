import {
  type GuildId,
  type Iso8601DateTime,
  type Logger,
  type ModuleContext,
  type ModuleDefinition,
  ModuleError,
  type ModuleId,
  type PermissionRegistryRecord,
  ValidationError,
} from '@varde/contracts';
import { satisfies as semverSatisfies } from 'semver';

/**
 * Plugin loader : orchestration du cycle de vie des modules.
 *
 * Pipeline :
 * 1. `register(def)` ajoute le module au registre en vérifiant la
 *    compatibilité `manifest.coreVersion` contre la version de core
 *    fournie à la construction.
 * 2. `loadAll()` calcule l'ordre de chargement par tri topologique
 *    (Kahn) sur `manifest.dependencies.modules`. Les cycles et les
 *    dépendances manquantes sont refusés (ValidationError). Les
 *    dépendances optionnelles (`optionalModules`) n'induisent ni
 *    cycle ni échec, juste un warn si absentes. `onLoad` de chaque
 *    module est ensuite invoqué dans l'ordre, avec un ctx construit
 *    par le `ctxFactory` injecté. Toute exception est encapsulée
 *    dans `ModuleError`.
 * 3. `enable(guildId, moduleId)` / `disable(guildId, moduleId)`
 *    appellent `onEnable` / `onDisable` en transmettant le `guildId`.
 *    Le loader maintient l'ensemble des guilds où chaque module est
 *    activé pour permettre un `unloadAll` propre.
 * 4. `unloadAll()` désactive chaque module actif dans chaque guild
 *    (ordre inverse du topologique) puis appelle `onUnload`.
 *
 * Isolation d'erreurs : un module qui jette dans un hook ne remonte
 * pas l'exception — elle est loguée et convertie en `ModuleError`.
 * La désactivation automatique après N crashes (plan) est reportée
 * post-V1 : la présente version signale seulement.
 *
 * Le loader est non-opinioné sur le ctx : `ctxFactory` est fourni par
 * l'appelant (bot ou test harness) et encapsule le scoping des
 * services. Pour les hooks de guild, le facteur reçoit `guildId` en
 * plus du `moduleId`.
 */

/** Référence légère d'un module (id + version figés au manifeste). */
export interface ModuleRef {
  readonly id: ModuleId;
  readonly version: string;
}

/** Signature du constructeur de ctx. */
export type CtxFactory = (ref: ModuleRef, guildId?: GuildId) => ModuleContext;

/**
 * Persiste un module dans `modules_registry` (upsert idempotent) et
 * ses permissions dans `permissions_registry`. Appelé par le loader
 * juste avant `onLoad` de chaque module pour satisfaire la FK
 * `permissions_registry.module_id → modules_registry.id`, elle-même
 * requise par `permission_bindings.permission_id` (ADR 0008).
 *
 * Injectable par le server (`apps/server`). Absent = skip — utile
 * pour les tests unitaires qui ne touchent pas la DB, mais en prod
 * doit toujours être fourni.
 */
export type PersistModuleRegistration = (args: {
  readonly moduleId: ModuleId;
  readonly version: string;
  readonly manifest: ModuleDefinition['manifest'];
  readonly permissions: readonly PermissionRegistryRecord[];
}) => Promise<void>;

/** Options de construction. */
export interface CreatePluginLoaderOptions {
  readonly coreVersion: string;
  readonly logger: Logger;
  readonly ctxFactory: CtxFactory;
  /**
   * Callback pour upsert module_registry + permissions_registry au
   * chargement du module. Typiquement : upsert `modules_registry` puis
   * appel `permissionService.registerPermissions(permissions)`.
   * Absent = skip (voir JSDoc de `PersistModuleRegistration`).
   */
  readonly persistModuleRegistration?: PersistModuleRegistration;
}

interface ModuleRecord {
  readonly definition: ModuleDefinition;
  readonly enabledGuilds: Set<GuildId>;
  loaded: boolean;
}

/** Loader public. */
export interface PluginLoader {
  readonly register: (definition: ModuleDefinition) => void;
  readonly loadAll: () => Promise<void>;
  readonly enable: (guildId: GuildId, moduleId: ModuleId) => Promise<void>;
  readonly disable: (guildId: GuildId, moduleId: ModuleId) => Promise<void>;
  readonly unloadAll: () => Promise<void>;
  readonly loadOrder: () => readonly ModuleId[];
  readonly isLoaded: (moduleId: ModuleId) => boolean;
  readonly isEnabled: (moduleId: ModuleId, guildId: GuildId) => boolean;
  readonly get: (moduleId: ModuleId) => ModuleDefinition | undefined;
}

const refOf = (definition: ModuleDefinition): ModuleRef => ({
  id: definition.manifest.id,
  version: definition.manifest.version,
});

const toModuleError = (moduleId: ModuleId, phase: string, error: unknown): ModuleError => {
  const cause = error instanceof Error ? error : new Error(String(error));
  return new ModuleError(`module "${moduleId}" : ${phase} a échoué`, moduleId, {
    cause,
    metadata: { phase },
  });
};

const sortByDependencies = (modules: ReadonlyMap<ModuleId, ModuleDefinition>): ModuleId[] => {
  const nodes = Array.from(modules.keys());
  const inDegree = new Map<ModuleId, number>();
  const reverseEdges = new Map<ModuleId, ModuleId[]>();

  for (const id of nodes) {
    inDegree.set(id, 0);
    reverseEdges.set(id, []);
  }

  for (const [id, def] of modules) {
    const deps = def.manifest.dependencies?.modules ?? [];
    for (const dep of deps) {
      if (!modules.has(dep)) {
        throw new ValidationError(
          `PluginLoader : dépendance manquante "${dep}" pour le module "${id}"`,
          { metadata: { moduleId: id, missing: dep } },
        );
      }
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      const reverse = reverseEdges.get(dep);
      if (reverse) reverse.push(id);
    }
  }

  const queue: ModuleId[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  queue.sort();

  const order: ModuleId[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as ModuleId;
    order.push(id);
    for (const successor of reverseEdges.get(id) ?? []) {
      const next = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, next);
      if (next === 0) queue.push(successor);
    }
  }

  if (order.length !== nodes.length) {
    const stuck = nodes.filter((id) => (inDegree.get(id) ?? 0) > 0);
    throw new ValidationError(`PluginLoader : cycle de dépendances détecté (${stuck.join(', ')})`, {
      metadata: { cycle: stuck },
    });
  }

  return order;
};

export function createPluginLoader(options: CreatePluginLoaderOptions): PluginLoader {
  const { coreVersion, ctxFactory, persistModuleRegistration } = options;
  const logger = options.logger.child({ component: 'loader' });
  const registry = new Map<ModuleId, ModuleRecord>();
  let computedOrder: ModuleId[] | null = null;

  const orderedDefinitions = (): ModuleId[] => {
    if (computedOrder) return computedOrder;
    const defs = new Map<ModuleId, ModuleDefinition>();
    for (const [id, record] of registry) defs.set(id, record.definition);
    computedOrder = sortByDependencies(defs);
    return computedOrder;
  };

  const checkCoreVersion = (definition: ModuleDefinition): void => {
    if (!semverSatisfies(coreVersion, definition.manifest.coreVersion)) {
      throw new ValidationError(
        `PluginLoader : module "${definition.manifest.id}" exige coreVersion ${definition.manifest.coreVersion}, or le core est en ${coreVersion}`,
        {
          metadata: {
            moduleId: definition.manifest.id,
            required: definition.manifest.coreVersion,
            actual: coreVersion,
          },
        },
      );
    }
  };

  const requireRecord = (moduleId: ModuleId): ModuleRecord => {
    const record = registry.get(moduleId);
    if (!record) {
      throw new ValidationError(`PluginLoader : module "${moduleId}" non enregistré`, {
        metadata: { moduleId },
      });
    }
    return record;
  };

  return {
    register(definition) {
      const id = definition.manifest.id;
      if (registry.has(id)) {
        throw new ValidationError(`PluginLoader : module "${id}" déjà enregistré`, {
          metadata: { moduleId: id },
        });
      }
      checkCoreVersion(definition);
      registry.set(id, { definition, enabledGuilds: new Set(), loaded: false });
      computedOrder = null;
      logger.debug('module enregistré', { moduleId: id });
    },

    async loadAll() {
      const order = orderedDefinitions();

      // Warn sur les optionalModules manquants.
      for (const id of order) {
        const def = registry.get(id)?.definition;
        const optionals = def?.manifest.dependencies?.optionalModules ?? [];
        for (const opt of optionals) {
          if (!registry.has(opt)) {
            logger.warn('dépendance optionnelle manquante', { moduleId: id, optional: opt });
          }
        }
      }

      for (const id of order) {
        const record = requireRecord(id);
        if (record.loaded) continue;

        // Persiste le module dans `modules_registry` + ses permissions
        // dans `permissions_registry` AVANT le `onLoad`. Deux invariants
        // ADR 0008 satisfaits ici :
        //
        //   1. `permissions_registry.module_id` → `modules_registry.id`
        //      (FK) : le module doit exister avant ses permissions.
        //   2. `permission_bindings.permission_id` →
        //      `permissions_registry.id` (FK) : les permissions doivent
        //      exister avant qu'une action onboarding
        //      `core.bindPermission` ou un bind manuel via dashboard
        //      puisse les lier à un rôle.
        //
        // Le callback est injecté par `apps/server` ; sans lui, pas de
        // persistance (tests unitaires par défaut).
        if (persistModuleRegistration) {
          const createdAt = new Date().toISOString() as Iso8601DateTime;
          const entries: PermissionRegistryRecord[] = record.definition.manifest.permissions.map(
            (perm) => ({
              id: perm.id,
              moduleId: id,
              description: perm.description,
              category: perm.category,
              defaultLevel: perm.defaultLevel,
              createdAt,
            }),
          );
          try {
            await persistModuleRegistration({
              moduleId: id,
              version: record.definition.manifest.version,
              manifest: record.definition.manifest,
              permissions: entries,
            });
            logger.debug('module enregistré en DB', {
              moduleId: id,
              permissionsCount: entries.length,
            });
          } catch (error) {
            const moduleError = toModuleError(id, 'persistModuleRegistration', error);
            logger.error('persistModuleRegistration en échec', moduleError, { moduleId: id });
            throw moduleError;
          }
        }

        if (!record.definition.onLoad) {
          record.loaded = true;
          continue;
        }
        const ctx = ctxFactory(refOf(record.definition));
        try {
          await record.definition.onLoad(ctx);
          record.loaded = true;
          logger.info('module chargé', { moduleId: id });
        } catch (error) {
          const moduleError = toModuleError(id, 'onLoad', error);
          logger.error('onLoad en échec', moduleError, { moduleId: id });
          throw moduleError;
        }
      }
    },

    async enable(guildId, moduleId) {
      const record = requireRecord(moduleId);
      if (!record.loaded) {
        throw new ValidationError(
          `PluginLoader : module "${moduleId}" non chargé (appeler loadAll d'abord)`,
          { metadata: { moduleId } },
        );
      }
      if (record.enabledGuilds.has(guildId)) return;
      if (record.definition.onEnable) {
        const ctx = ctxFactory(refOf(record.definition), guildId);
        try {
          await record.definition.onEnable(ctx, guildId);
        } catch (error) {
          const moduleError = toModuleError(moduleId, 'onEnable', error);
          logger.error('onEnable en échec', moduleError, { moduleId, guildId });
          throw moduleError;
        }
      }
      record.enabledGuilds.add(guildId);
      logger.info('module activé sur la guild', { moduleId, guildId });
    },

    async disable(guildId, moduleId) {
      const record = requireRecord(moduleId);
      if (!record.enabledGuilds.has(guildId)) return;
      if (record.definition.onDisable) {
        const ctx = ctxFactory(refOf(record.definition), guildId);
        try {
          await record.definition.onDisable(ctx, guildId);
        } catch (error) {
          const moduleError = toModuleError(moduleId, 'onDisable', error);
          logger.error('onDisable en échec', moduleError, { moduleId, guildId });
          // Poursuite du retrait : un onDisable cassé ne doit pas
          // laisser la guild indéfiniment "activée" côté loader.
        }
      }
      record.enabledGuilds.delete(guildId);
      logger.info('module désactivé sur la guild', { moduleId, guildId });
    },

    async unloadAll() {
      const order = orderedDefinitions();
      // Désactiver tout ce qui est encore enabled (ordre inverse).
      for (const id of [...order].reverse()) {
        const record = registry.get(id);
        if (!record) continue;
        const guilds = Array.from(record.enabledGuilds);
        for (const guildId of guilds) {
          try {
            if (record.definition.onDisable) {
              const ctx = ctxFactory(refOf(record.definition), guildId);
              await record.definition.onDisable(ctx, guildId);
            }
          } catch (error) {
            logger.warn('onDisable en échec pendant unloadAll', {
              moduleId: id,
              guildId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        record.enabledGuilds.clear();
      }
      // Puis onUnload dans l'ordre inverse.
      for (const id of [...order].reverse()) {
        const record = registry.get(id);
        if (!record?.loaded) continue;
        if (record.definition.onUnload) {
          try {
            const ctx = ctxFactory(refOf(record.definition));
            await record.definition.onUnload(ctx);
          } catch (error) {
            logger.warn('onUnload en échec', {
              moduleId: id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        record.loaded = false;
      }
    },

    loadOrder() {
      return orderedDefinitions();
    },

    isLoaded(moduleId) {
      return registry.get(moduleId)?.loaded ?? false;
    },

    isEnabled(moduleId, guildId) {
      return registry.get(moduleId)?.enabledGuilds.has(guildId) ?? false;
    },

    get(moduleId) {
      return registry.get(moduleId)?.definition;
    },
  };
}
