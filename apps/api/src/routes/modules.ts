import type { ActionId, GuildId, ModuleId, PermissionLevel, UserId } from '@varde/contracts';
import type {
  CoreAuditService,
  CoreConfigService,
  GuildPermissionsService,
  PluginLoader,
  UserPreferencesService,
} from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAccess } from '../middleware/require-guild-access.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Routes de pilotage des modules côté admin :
 *
 * - `GET /guilds/:guildId/modules` : liste des modules chargés côté
 *   core avec leur état `enabled` pour la guild ciblée. Source de
 *   vérité : le `PluginLoader` (runtime) — pas la table
 *   `guild_modules` (qui servira plus tard à la persistance entre
 *   redémarrages, hors scope V1).
 *
 * - `GET /guilds/:guildId/modules/:moduleId/config` : renvoie la
 *   config actuelle du module pour la guild, plus les métadonnées
 *   nécessaires au rendu côté dashboard (`configUi` et
 *   `configSchema` converti en JSON Schema via
 *   `z.toJSONSchema()` Zod 4).
 *
 * - `PUT /guilds/:guildId/modules/:moduleId/config` : valide le body
 *   contre le `configSchema` du module, puis persiste via
 *   `ConfigService.setWith` avec scope `modules.<moduleId>` et
 *   `updatedBy: session.userId`. L'événement `config.changed` est
 *   émis par le ConfigService ; un subscriber global au niveau de
 *   `apps/server` écrit l'entrée `core.config.updated` dans l'audit
 *   log. La route elle-même n'écrit plus d'audit — source unique de
 *   vérité, capture automatiquement tout `setWith` futur (onboarding
 *   jalon 3, modules, etc.).
 *
 * Toutes les routes nécessitent MANAGE_GUILD via
 * `requireGuildAdmin` (401 anonyme, 400 sans access_token, 403 sans
 * permission).
 */

interface PermissionDefinitionDto {
  readonly id: string;
  readonly category: string;
  readonly defaultLevel: string;
  readonly description: string;
}

interface ModuleListItemDto {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly permissions: readonly PermissionDefinitionDto[];
  /**
   * Champs d'enrichissement (jalon 7 PR 7.4.3) consommés par la
   * grille de modules du dashboard. Sources :
   * - `category`, `icon`, `shortDescription` : manifeste du module
   *   (PR 7.4.0). `null` pour un module tiers qui ne les fournit pas.
   * - `isPinned` : présence du moduleId dans
   *   `user_guild_preferences.pinnedModules` pour le couple
   *   (sessionUser, guildId).
   * - `lastConfiguredAt` : timestamp ISO de la dernière entrée
   *   `core.config.updated` avec scope `modules.<id>` dans l'audit
   *   log de la guild. `null` si jamais configuré.
   */
  readonly category: string | null;
  readonly icon: string | null;
  readonly shortDescription: string | null;
  readonly isPinned: boolean;
  readonly lastConfiguredAt: string | null;
}

interface ModuleConfigDto {
  readonly config: Readonly<Record<string, unknown>>;
  readonly configUi: unknown;
  readonly configSchema: unknown;
}

export interface RegisterModulesRoutesOptions {
  readonly loader: PluginLoader;
  readonly config: CoreConfigService;
  readonly discord: DiscordClient;
  readonly guildPermissions: GuildPermissionsService;
  /**
   * Sert à calculer `isPinned` par-utilisateur sur la liste des
   * modules (jalon 7 PR 7.4.3).
   */
  readonly userPreferences: UserPreferencesService;
  /**
   * Sert à calculer `lastConfiguredAt` par module en lisant l'audit
   * log filtré sur `core.config.updated` (jalon 7 PR 7.4.3).
   */
  readonly audit: CoreAuditService;
  /**
   * Plafond du nombre d'entrées audit lues pour calculer
   * `lastConfiguredAt`. Au-delà, les modules dont la dernière
   * configuration est plus ancienne que cette fenêtre voient
   * `lastConfiguredAt` à `null`. Défaut : 200 — couvre largement
   * les serveurs typiques (≤ 4 modules officiels × historique
   * récent). Réduit à l'essentiel par les tests.
   */
  readonly lastConfiguredAuditLimit?: number;
}

/**
 * Niveau requis par un module — `requiredPermission` du runtime
 * `ModuleDefinition`. Défaut implicite : `'admin'` (cf. spec
 * jalon 7 PR 7.3).
 */
const moduleLevel = (
  def: { readonly requiredPermission?: PermissionLevel } | undefined,
): PermissionLevel => def?.requiredPermission ?? 'admin';

const extractModuleConfig = (
  snapshot: unknown,
  moduleId: string,
): Readonly<Record<string, unknown>> => {
  if (typeof snapshot !== 'object' || snapshot === null) return {};
  const modules = (snapshot as { modules?: unknown }).modules;
  if (typeof modules !== 'object' || modules === null) return {};
  const own = (modules as Record<string, unknown>)[moduleId];
  return (typeof own === 'object' && own !== null ? own : {}) as Record<string, unknown>;
};

/**
 * Lit le flag « override admin » d'activation d'un module pour une
 * guild dans `guild_config` sous `core.modules.<moduleId>.enabled`.
 *
 * - `true`  → admin a explicitement activé (force on)
 * - `false` → admin a explicitement désactivé (force off)
 * - `null`  → aucun override, le default core (DEFAULT_ENABLED_MODULES
 *   côté bin.ts) s'applique
 *
 * Helper exporté pour que `apps/server/bin.ts` réplique l'override
 * au boot, sinon le module repart toujours en default au restart.
 */
export const readModuleEnabledOverride = (snapshot: unknown, moduleId: string): boolean | null => {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const core = (snapshot as { core?: unknown }).core;
  if (typeof core !== 'object' || core === null) return null;
  const modules = (core as { modules?: unknown }).modules;
  if (typeof modules !== 'object' || modules === null) return null;
  const slot = (modules as Record<string, unknown>)[moduleId];
  if (typeof slot !== 'object' || slot === null) return null;
  const enabled = (slot as { enabled?: unknown }).enabled;
  return typeof enabled === 'boolean' ? enabled : null;
};

const setEnabledBodySchema = z.object({
  enabled: z.boolean(),
});

const httpError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Error & { statusCode: number; code: string; details?: unknown } => {
  const err = new Error(message) as Error & {
    statusCode: number;
    code: string;
    details?: unknown;
  };
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
};

export function registerModulesRoutes(
  app: FastifyInstance,
  options: RegisterModulesRoutesOptions,
): void {
  const lastConfiguredLimit = options.lastConfiguredAuditLimit ?? 200;

  /**
   * Lit les N dernières entrées `core.config.updated` pour cette
   * guild et construit une Map<moduleId, latestTimestamp>. Le
   * `audit.query` est ordonné desc par défaut, donc le premier
   * `metadata.scope = modules.<id>` rencontré pour un moduleId
   * donné est aussi le plus récent.
   */
  const buildLastConfiguredMap = async (guildId: GuildId): Promise<Map<string, string>> => {
    const rows = await options.audit.query({
      guildId,
      action: 'core.config.updated' as ActionId,
      limit: lastConfiguredLimit,
    });
    const result = new Map<string, string>();
    for (const row of rows) {
      const scope = row.metadata['scope'];
      if (typeof scope !== 'string' || !scope.startsWith('modules.')) continue;
      const moduleId = scope.slice('modules.'.length);
      if (moduleId.length === 0 || result.has(moduleId)) continue;
      result.set(moduleId, row.createdAt);
    }
    return result;
  };

  app.get<{ Params: { guildId: string } }>('/guilds/:guildId/modules', async (request) => {
    const { guildId } = request.params;
    // Niveau d'entrée : `moderator` (admin satisfait aussi). Le
    // filtrage par module suit selon `requiredPermission` du module.
    const session = await requireGuildAccess(
      app,
      request,
      guildId as GuildId,
      options.guildPermissions,
      'moderator',
    );
    const [userLevel, guildPrefs, lastConfiguredMap] = await Promise.all([
      options.guildPermissions.getUserLevel(guildId as GuildId, session.userId as UserId),
      options.userPreferences.getGuildPreferences(session.userId as UserId, guildId as GuildId),
      buildLastConfiguredMap(guildId as GuildId),
    ]);
    const pinnedSet = new Set(guildPrefs.pinnedModules.map((p) => p.moduleId));

    const items: ModuleListItemDto[] = [];
    for (const id of options.loader.loadOrder()) {
      const def = options.loader.get(id);
      if (!def) continue;
      // Un user `moderator` ne voit que les modules taggés
      // `'moderator'`. Un `admin` voit tout.
      if (userLevel !== 'admin' && moduleLevel(def) !== 'moderator') continue;
      items.push({
        id,
        version: def.manifest.version,
        name: def.manifest.name,
        description: def.manifest.description,
        enabled: options.loader.isEnabled(id, guildId as GuildId),
        permissions: def.manifest.permissions.map((p) => ({
          id: p.id,
          category: p.category,
          defaultLevel: p.defaultLevel,
          description: p.description,
        })),
        category: def.manifest.category ?? null,
        icon: def.manifest.icon ?? null,
        shortDescription: def.manifest.shortDescription ?? null,
        isPinned: pinnedSet.has(id),
        lastConfiguredAt: lastConfiguredMap.get(id) ?? null,
      });
    }
    return items;
  });

  app.get<{ Params: { guildId: string; moduleId: string } }>(
    '/guilds/:guildId/modules/:moduleId/config',
    async (request): Promise<ModuleConfigDto> => {
      const { guildId, moduleId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      const def = options.loader.get(moduleId as ModuleId);
      if (!def) {
        throw httpError(404, 'module_not_found', `Module "${moduleId}" inconnu.`);
      }

      let snapshot: unknown = {};
      try {
        snapshot = await options.config.get(guildId as GuildId);
      } catch {
        snapshot = {};
      }

      return {
        config: extractModuleConfig(snapshot, moduleId),
        configUi: def.configUi ?? null,
        configSchema: def.configSchema ? z.toJSONSchema(def.configSchema as ZodType) : null,
      };
    },
  );

  // PUT /guilds/:guildId/modules/:moduleId/enabled — toggle d'activation
  // côté admin. Persiste l'override dans guild_config et applique
  // immédiatement via le PluginLoader (enable/disable runtime).
  app.put<{
    Params: { guildId: string; moduleId: string };
    Body: unknown;
  }>('/guilds/:guildId/modules/:moduleId/enabled', async (request, reply) => {
    const { guildId, moduleId } = request.params;
    const session = await requireGuildAdmin(app, request, guildId, options.discord);

    const def = options.loader.get(moduleId as ModuleId);
    if (!def) {
      throw httpError(404, 'module_not_found', `Module "${moduleId}" inconnu.`);
    }

    const parsed = setEnabledBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(
        400,
        'invalid_body',
        'Body invalide — attendu `{ enabled: boolean }`.',
        parsed.error.issues,
      );
    }
    const { enabled } = parsed.data;

    // Persist override dans guild_config (lecture au boot par bin.ts).
    await options.config.setWith(
      guildId as GuildId,
      { core: { modules: { [moduleId]: { enabled } } } },
      { scope: `core.modules.${moduleId}`, updatedBy: session.userId as UserId },
    );

    // Application immédiate runtime via le loader.
    try {
      if (enabled) {
        await options.loader.enable(guildId as GuildId, moduleId as ModuleId);
      } else {
        await options.loader.disable(guildId as GuildId, moduleId as ModuleId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw httpError(
        500,
        'loader_failed',
        `loader.${enabled ? 'enable' : 'disable'} a échoué : ${message}`,
      );
    }

    void reply.status(204).send();
  });

  app.put<{
    Params: { guildId: string; moduleId: string };
    Body: unknown;
  }>('/guilds/:guildId/modules/:moduleId/config', async (request, reply) => {
    const { guildId, moduleId } = request.params;
    const session = await requireGuildAdmin(app, request, guildId, options.discord);

    const def = options.loader.get(moduleId as ModuleId);
    if (!def) {
      throw httpError(404, 'module_not_found', `Module "${moduleId}" inconnu.`);
    }

    const body = request.body ?? {};
    let validated: unknown = body;
    if (def.configSchema) {
      const result = (def.configSchema as ZodType).safeParse(body);
      if (!result.success) {
        throw httpError(
          400,
          'invalid_config',
          `Body refusé par configSchema de "${moduleId}".`,
          result.error.issues,
        );
      }
      validated = result.data;
    }

    await options.config.setWith(
      guildId as GuildId,
      { modules: { [moduleId]: validated } },
      { scope: `modules.${moduleId}`, updatedBy: session.userId as UserId },
    );

    void reply.status(204).send();
  });
}
