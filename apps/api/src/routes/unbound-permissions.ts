import type { GuildId, ModuleId } from '@varde/contracts';
import type { CorePermissionService, PluginLoader } from '@varde/core';
import type { FastifyInstance } from 'fastify';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Options d'enregistrement de la route unbound-permissions.
 */
export interface RegisterUnboundPermissionsRoutesOptions {
  readonly loader: PluginLoader;
  readonly permissions: CorePermissionService;
  readonly discord: DiscordClient;
}

/**
 * Route : GET /guilds/:guildId/modules/:moduleId/unbound-permissions
 *
 * Calcule la différence entre :
 *  - les permissions déclarées dans le manifeste du module
 *  - les lignes `permission_bindings` existantes pour cette guild
 *
 * Retourne la liste des permissions non liées à un rôle. Utilisée
 * par le dashboard pour afficher `UnboundPermissionsBanner`
 * (ADR 0008, seeding C).
 *
 * Accès restreint : MANAGE_GUILD Discord requis via `requireGuildAdmin`.
 */
export function registerUnboundPermissionsRoutes(
  app: FastifyInstance,
  options: RegisterUnboundPermissionsRoutesOptions,
): void {
  app.get<{ Params: { guildId: string; moduleId: string } }>(
    '/guilds/:guildId/modules/:moduleId/unbound-permissions',
    async (request) => {
      const { guildId, moduleId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      const def = options.loader.get(moduleId as ModuleId);
      if (!def) {
        const err: Error & { statusCode?: number; code?: string } = new Error(
          `Module "${moduleId}" inconnu.`,
        );
        err.statusCode = 404;
        err.code = 'module_not_found';
        throw err;
      }

      const bindings = await options.permissions.listBindings(guildId as GuildId);
      const boundIds = new Set(bindings.map((b) => b.permissionId));

      const unbound = def.manifest.permissions.filter((p) => !boundIds.has(p.id));

      return {
        permissions: unbound.map((p) => ({
          id: p.id,
          description: p.description,
          category: p.category,
          defaultLevel: p.defaultLevel,
        })),
      };
    },
  );
}
