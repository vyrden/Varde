import type { GuildId, UserId } from '@varde/contracts';
import { ValidationError } from '@varde/contracts';
import type { GuildPermissionsService } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireGuildAccess } from '../middleware/require-guild-access.js';
import type { GuildRoleDto } from './discord-channels.js';

/**
 * Routes de configuration des permissions par-guild (jalon 7 PR
 * 7.3 sub-livrable 6).
 *
 * Trois endpoints :
 *
 * - `GET    /guilds/:guildId/permissions` — config + rôles
 *   enrichis (id, name, color, position, memberCount). Admin only.
 *
 * - `PUT    /guilds/:guildId/permissions` — body
 *   `{ adminRoleIds, moderatorRoleIds }`. Validations :
 *   `adminRoleIds` non-vide, pas de doublons inter ou intra liste,
 *   tous les IDs existent réellement sur la guild Discord. La
 *   persistance + audit log + invalidation cache est assurée par
 *   `guildPermissionsService.updateConfig`.
 *
 * - `POST   /guilds/:guildId/permissions/preview` — body comme PUT.
 *   Retourne les membres qui auraient accès à chaque niveau, sans
 *   persister. Best-effort : la liste vient du cache discord.js,
 *   donc seuls les membres déjà chargés (qui ont parlé / été
 *   touchés récemment) sont énumérés. Pour un preview complet, il
 *   faudrait `guild.members.fetch()` qui est rate-limité.
 */

const patchSchema = z.object({
  adminRoleIds: z.array(z.string().min(1)),
  moderatorRoleIds: z.array(z.string().min(1)),
});

/** Forme retournée par `GET /permissions`. */
export interface PermissionsConfigResponse {
  readonly adminRoleIds: readonly string[];
  readonly moderatorRoleIds: readonly string[];
  readonly roles: readonly GuildRoleDto[];
}

/** Forme d'un membre dans le preview. */
export interface PermissionsPreviewMember {
  readonly id: string;
  readonly username?: string;
  readonly avatarUrl?: string | null;
  /** Rôles du membre qui matchent la config preview. */
  readonly grantedBy: readonly string[];
}

/** Forme retournée par `POST /permissions/preview`. */
export interface PermissionsPreviewResponse {
  readonly admins: readonly PermissionsPreviewMember[];
  readonly moderators: readonly PermissionsPreviewMember[];
}

/** Vue minimale d'un membre injectée par bin.ts. */
export interface PermissionsMemberSnapshot {
  readonly id: string;
  readonly username?: string;
  readonly avatarUrl?: string | null;
  readonly roleIds: readonly string[];
}

/** Options de construction. */
export interface RegisterPermissionsRoutesOptions {
  readonly guildPermissions: GuildPermissionsService;
  /** Liste enrichie des rôles d'une guild. Utilisée par GET et la validation PUT. */
  readonly listGuildRoles: (guildId: string) => Promise<readonly GuildRoleDto[]>;
  /**
   * Liste des membres d'une guild (best-effort cache-based). Utilisée
   * par le preview. Peut retourner `[]` si le cache est froid.
   */
  readonly listGuildMembers: (guildId: string) => Promise<readonly PermissionsMemberSnapshot[]>;
}

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

const validateAgainstGuildRoles = async (
  options: RegisterPermissionsRoutesOptions,
  guildId: string,
  patch: { readonly adminRoleIds: readonly string[]; readonly moderatorRoleIds: readonly string[] },
): Promise<void> => {
  const roles = await options.listGuildRoles(guildId);
  const known = new Set(roles.map((r) => r.id));
  const unknown: string[] = [];
  for (const id of [...patch.adminRoleIds, ...patch.moderatorRoleIds]) {
    if (!known.has(id)) {
      unknown.push(id);
    }
  }
  if (unknown.length > 0) {
    throw httpError(422, 'unknown_role_ids', "Certains role IDs n'existent pas sur ce serveur.", {
      unknown,
    });
  }
};

const computePreview = (
  patch: {
    readonly adminRoleIds: readonly string[];
    readonly moderatorRoleIds: readonly string[];
  },
  members: readonly PermissionsMemberSnapshot[],
): PermissionsPreviewResponse => {
  const adminSet = new Set(patch.adminRoleIds);
  const modSet = new Set(patch.moderatorRoleIds);
  const admins: PermissionsPreviewMember[] = [];
  const moderators: PermissionsPreviewMember[] = [];
  for (const m of members) {
    const adminMatches = m.roleIds.filter((rid) => adminSet.has(rid));
    if (adminMatches.length > 0) {
      admins.push({
        id: m.id,
        ...(m.username !== undefined ? { username: m.username } : {}),
        ...(m.avatarUrl !== undefined ? { avatarUrl: m.avatarUrl } : {}),
        grantedBy: adminMatches,
      });
      continue;
    }
    const modMatches = m.roleIds.filter((rid) => modSet.has(rid));
    if (modMatches.length > 0) {
      moderators.push({
        id: m.id,
        ...(m.username !== undefined ? { username: m.username } : {}),
        ...(m.avatarUrl !== undefined ? { avatarUrl: m.avatarUrl } : {}),
        grantedBy: modMatches,
      });
    }
  }
  return { admins, moderators };
};

export function registerPermissionsRoutes(
  app: FastifyInstance,
  options: RegisterPermissionsRoutesOptions,
): void {
  const { guildPermissions } = options;

  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/permissions',
    async (request): Promise<PermissionsConfigResponse> => {
      const { guildId } = request.params;
      await requireGuildAccess(app, request, guildId as GuildId, guildPermissions, 'admin');
      const [config, roles] = await Promise.all([
        guildPermissions.getConfig(guildId as GuildId),
        options.listGuildRoles(guildId),
      ]);
      return {
        adminRoleIds: config.adminRoleIds,
        moderatorRoleIds: config.moderatorRoleIds,
        roles,
      };
    },
  );

  app.put<{ Params: { guildId: string } }>(
    '/guilds/:guildId/permissions',
    async (request): Promise<PermissionsConfigResponse> => {
      const { guildId } = request.params;
      const session = await requireGuildAccess(
        app,
        request,
        guildId as GuildId,
        guildPermissions,
        'admin',
      );
      const parsed = patchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const patch = parsed.data;
      // Pré-validation Discord (existence des roles) avant de
      // déléguer au service — message d'erreur plus précis.
      await validateAgainstGuildRoles(options, guildId, patch);
      // updateConfig effectue les validations métier
      // (non-vide / pas de doublons / pas d'overlap) et lève
      // ValidationError. On la re-throw en 422 (le setErrorHandler
      // global mappe ValidationError → 400 par défaut, mais le spec
      // exige 422 pour ces refus de body sémantique).
      let updated: Awaited<ReturnType<GuildPermissionsService['updateConfig']>>;
      try {
        updated = await guildPermissions.updateConfig(guildId as GuildId, patch, {
          type: 'user',
          id: session.userId as UserId,
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          throw httpError(422, 'invalid_permissions', err.message);
        }
        throw err;
      }
      const roles = await options.listGuildRoles(guildId);
      return {
        adminRoleIds: updated.adminRoleIds,
        moderatorRoleIds: updated.moderatorRoleIds,
        roles,
      };
    },
  );

  app.post<{ Params: { guildId: string } }>(
    '/guilds/:guildId/permissions/preview',
    async (request): Promise<PermissionsPreviewResponse> => {
      const { guildId } = request.params;
      await requireGuildAccess(app, request, guildId as GuildId, guildPermissions, 'admin');
      const parsed = patchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      await validateAgainstGuildRoles(options, guildId, parsed.data);
      const members = await options.listGuildMembers(guildId);
      return computePreview(parsed.data, members);
    },
  );
}
