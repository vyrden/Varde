import type { GuildId, ModuleId, UserId } from '@varde/contracts';
import type { CoreConfigService, PluginLoader } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
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
}

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
  app.get<{ Params: { guildId: string } }>('/guilds/:guildId/modules', async (request) => {
    const { guildId } = request.params;
    await requireGuildAdmin(app, request, guildId, options.discord);

    const items: ModuleListItemDto[] = [];
    for (const id of options.loader.loadOrder()) {
      const def = options.loader.get(id);
      if (!def) continue;
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
