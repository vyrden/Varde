import type { GuildId, ModuleId, PermissionId, RoleId } from '@varde/contracts';
import type { CorePermissionService, PluginLoader } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Options d'enregistrement des routes de gestion des bindings de
 * permissions par module.
 */
export interface RegisterModulePermissionsRoutesOptions {
  readonly loader: PluginLoader;
  readonly permissions: CorePermissionService;
  readonly discord: DiscordClient;
}

const paramsSchema = z.object({
  guildId: z.string().min(1),
  moduleId: z.string().min(1),
  permissionId: z.string().min(1),
});

const bindBodySchema = z.object({
  roleId: z.string().regex(/^\d{17,19}$/),
});

/**
 * Routes de gestion des bindings permission → rôle :
 *
 * - `GET /guilds/:guildId/permissions/bindings` : liste tous les
 *   bindings actifs pour la guild.
 *
 * - `POST /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings` :
 *   lie un rôle Discord à une permission déclarée par un module.
 *   Vérifie que le module existe et que la permission est bien dans
 *   son manifeste avant de persister.
 *
 * - `DELETE /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings/:roleId` :
 *   supprime le binding `(permissionId, roleId)` pour la guild.
 *
 * Toutes les routes nécessitent MANAGE_GUILD via `requireGuildAdmin`.
 */
export function registerModulePermissionsRoutes(
  app: FastifyInstance,
  options: RegisterModulePermissionsRoutesOptions,
): void {
  // GET /guilds/:guildId/permissions/bindings
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/permissions/bindings',
    async (request) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);
      const bindings = await options.permissions.listBindings(guildId as GuildId);
      return {
        bindings: bindings.map((b) => ({ permissionId: b.permissionId, roleId: b.roleId })),
      };
    },
  );

  // POST /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings
  app.post<{
    Params: z.infer<typeof paramsSchema>;
    Body: z.infer<typeof bindBodySchema>;
  }>(
    '/guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings',
    async (request, reply) => {
      const params = paramsSchema.parse(request.params);
      const body = bindBodySchema.parse(request.body);
      await requireGuildAdmin(app, request, params.guildId, options.discord);

      // Vérifie que le module existe et a bien déclaré cette permission.
      const moduleDef = options.loader.get(params.moduleId as ModuleId);
      if (!moduleDef) {
        return reply.code(404).send({ error: 'module_not_found' });
      }
      const permDeclared = moduleDef.manifest.permissions.some((p) => p.id === params.permissionId);
      if (!permDeclared) {
        return reply.code(404).send({ error: 'permission_not_found' });
      }

      await options.permissions.bind(
        params.guildId as GuildId,
        params.permissionId as PermissionId,
        body.roleId as RoleId,
      );
      return reply.code(204).send();
    },
  );

  // DELETE /guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings/:roleId
  app.delete<{
    Params: z.infer<typeof paramsSchema> & { roleId: string };
  }>(
    '/guilds/:guildId/modules/:moduleId/permissions/:permissionId/bindings/:roleId',
    async (request, reply) => {
      const { guildId, permissionId, roleId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);
      await options.permissions.unbind(
        guildId as GuildId,
        permissionId as PermissionId,
        roleId as RoleId,
      );
      return reply.code(204).send();
    },
  );
}
