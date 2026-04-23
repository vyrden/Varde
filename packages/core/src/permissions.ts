import type {
  AuditActor,
  AuditTarget,
  GuildId,
  PermissionId,
  PermissionRegistryRecord,
  RoleId,
  UserId,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema } from '@varde/db';
import { and, eq } from 'drizzle-orm';

/**
 * PermissionService : résolution d'autorisations applicatives.
 *
 * Règles V1 :
 * - Acteur `system` : toujours autorisé.
 * - Acteur `module` : accès implicite aux permissions déclarées sous
 *   son propre préfixe (`<moduleId>.<verb>`). Rejette une permission
 *   déclarée par un autre module.
 * - Acteur `user` : résolution via un `MemberContextResolver` injecté
 *   à la construction, qui fournit pour (guild, user) son ensemble de
 *   rôles Discord + des flags `isOwner` / `isAdministrator`. `isOwner`
 *   bypass toujours ; `isAdministrator` bypass si
 *   `bypassAdministrator` (défaut `true`). Sinon, lookup
 *   `permission_bindings` (mapping permission → rôles) et comparaison
 *   avec les rôles du user.
 *
 * Cache par guild : index `permission → Set<roleId>` chargé
 * paresseusement au premier appel et gardé en mémoire.
 * `invalidate(guildId)` vide le cache pour cette guild ; le core
 * branchera cet appel sur l'événement `config.changed` en PR 1.4.
 *
 * Pourquoi deux signatures `can` / `canInGuild` ? Le contrat
 * `PermissionService.can(actor, permission, target?)` ne porte pas
 * le guildId explicitement. Comme les permissions sont toujours
 * guild-scoped, le service exposé via `ctx.permissions` sera pré-
 * scopé par le ctx factory (PR 1.5) à partir de `canInGuild`. Au
 * niveau core, les deux existent pour ne pas dupliquer la logique.
 *
 * Le paramètre `target` n'est pas consommé en V1 ; il reste pour
 * conformité et pour les règles fines à venir.
 */

/** Contexte d'un membre Discord pour une guild donnée. */
export interface PermissionContext {
  readonly roles: readonly RoleId[];
  readonly isOwner: boolean;
  readonly isAdministrator: boolean;
}

/** Résolveur : (guild, user) → contexte Discord du membre. */
export type MemberContextResolver = (
  guildId: GuildId,
  userId: UserId,
) => Promise<PermissionContext | null>;

/** Options de construction. */
export interface CreatePermissionServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly resolveMemberContext: MemberContextResolver;
  /** Bypass automatique si le user a la permission Discord Administrator. Défaut : true. */
  readonly bypassAdministrator?: boolean;
}

/** Service exposé au core : contrat + opérations internes. */
export interface CorePermissionService {
  readonly can: (
    actor: AuditActor,
    permission: PermissionId,
    target?: AuditTarget,
  ) => Promise<boolean>;
  readonly canInGuild: (
    guildId: GuildId,
    actor: AuditActor,
    permission: PermissionId,
    target?: AuditTarget,
  ) => Promise<boolean>;
  readonly invalidate: (guildId: GuildId) => void;
  readonly registerPermissions: (entries: readonly PermissionRegistryRecord[]) => Promise<void>;
  /**
   * Lie une permission à un rôle Discord sur une guild. Insert
   * idempotent : si la ligne existe déjà, no-op. Invalide le cache
   * de la guild concernée pour que la résolution suivante lise la
   * nouvelle valeur.
   */
  readonly bind: (
    guildId: GuildId,
    permissionId: PermissionId,
    roleId: RoleId,
  ) => Promise<void>;
  /**
   * Supprime uniquement la ligne `(guildId, permissionId, roleId)`.
   * No-op si la ligne n'existe pas. Invalide le cache.
   */
  readonly unbind: (
    guildId: GuildId,
    permissionId: PermissionId,
    roleId: RoleId,
  ) => Promise<void>;
}

type PermissionIndex = ReadonlyMap<PermissionId, ReadonlySet<RoleId>>;

const aggregate = (
  rows: readonly { readonly permissionId: string; readonly roleId: string }[],
): PermissionIndex => {
  const index = new Map<PermissionId, Set<RoleId>>();
  for (const row of rows) {
    const pid = row.permissionId as PermissionId;
    const rid = row.roleId as RoleId;
    const set = index.get(pid) ?? new Set<RoleId>();
    set.add(rid);
    index.set(pid, set);
  }
  return index;
};

const loadPermissionIndex = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
): Promise<PermissionIndex> => {
  if (client.driver === 'pg') {
    const { permissionBindings } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({
        permissionId: permissionBindings.permissionId,
        roleId: permissionBindings.roleId,
      })
      .from(permissionBindings)
      .where(eq(permissionBindings.guildId, guildId));
    return aggregate(rows);
  }
  const { permissionBindings } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const rows = sqlite.db
    .select({
      permissionId: permissionBindings.permissionId,
      roleId: permissionBindings.roleId,
    })
    .from(permissionBindings)
    .where(eq(permissionBindings.guildId, guildId))
    .all();
  return aggregate(rows);
};

const moduleOwnsPermission = (moduleId: string, permission: PermissionId): boolean =>
  permission.startsWith(`${moduleId}.`);

const upsertPermissions = async <D extends DbDriver>(
  client: DbClient<D>,
  entries: readonly PermissionRegistryRecord[],
): Promise<void> => {
  if (entries.length === 0) {
    return;
  }
  if (client.driver === 'pg') {
    const { permissionsRegistry } = pgSchema;
    const pg = client as DbClient<'pg'>;
    for (const entry of entries) {
      await pg.db
        .insert(permissionsRegistry)
        .values({
          id: entry.id,
          moduleId: entry.moduleId,
          description: entry.description,
          category: entry.category,
          defaultLevel: entry.defaultLevel,
          createdAt: new Date(entry.createdAt),
        })
        .onConflictDoUpdate({
          target: permissionsRegistry.id,
          set: {
            description: entry.description,
            category: entry.category,
            defaultLevel: entry.defaultLevel,
          },
        });
    }
    return;
  }
  const { permissionsRegistry } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  for (const entry of entries) {
    await sqlite.db
      .insert(permissionsRegistry)
      .values({
        id: entry.id,
        moduleId: entry.moduleId,
        description: entry.description,
        category: entry.category,
        defaultLevel: entry.defaultLevel,
        createdAt: entry.createdAt,
      })
      .onConflictDoUpdate({
        target: permissionsRegistry.id,
        set: {
          description: entry.description,
          category: entry.category,
          defaultLevel: entry.defaultLevel,
        },
      });
  }
};

export function createPermissionService<D extends DbDriver>(
  options: CreatePermissionServiceOptions<D>,
): CorePermissionService {
  const { client, resolveMemberContext } = options;
  const bypassAdministrator = options.bypassAdministrator ?? true;

  const cache = new Map<GuildId, Promise<PermissionIndex>>();

  const indexFor = (guildId: GuildId): Promise<PermissionIndex> => {
    const existing = cache.get(guildId);
    if (existing) {
      return existing;
    }
    const loading = loadPermissionIndex(client, guildId);
    cache.set(guildId, loading);
    loading.catch(() => cache.delete(guildId));
    return loading;
  };

  const decideUser = async (
    guildId: GuildId,
    userId: UserId,
    permission: PermissionId,
  ): Promise<boolean> => {
    const ctx = await resolveMemberContext(guildId, userId);
    if (!ctx) {
      return false;
    }
    if (ctx.isOwner) {
      return true;
    }
    if (bypassAdministrator && ctx.isAdministrator) {
      return true;
    }
    const index = await indexFor(guildId);
    const allowed = index.get(permission);
    if (!allowed || allowed.size === 0) {
      return false;
    }
    return ctx.roles.some((role) => allowed.has(role));
  };

  const decide = async (
    guildId: GuildId | null,
    actor: AuditActor,
    permission: PermissionId,
  ): Promise<boolean> => {
    switch (actor.type) {
      case 'system':
        return true;
      case 'module':
        return moduleOwnsPermission(actor.id, permission);
      case 'user':
        if (guildId === null) {
          return false;
        }
        return decideUser(guildId, actor.id, permission);
    }
  };

  return {
    async can(actor, permission) {
      return decide(null, actor, permission);
    },

    async canInGuild(guildId, actor, permission) {
      return decide(guildId, actor, permission);
    },

    invalidate(guildId) {
      cache.delete(guildId);
    },

    async registerPermissions(entries) {
      await upsertPermissions(client, entries);
    },

    async bind(guildId, permissionId, roleId) {
      if (client.driver === 'pg') {
        const { permissionBindings } = pgSchema;
        const pg = client as DbClient<'pg'>;
        await pg.db
          .insert(permissionBindings)
          .values({
            guildId,
            permissionId,
            roleId,
            createdAt: new Date(),
          })
          .onConflictDoNothing({
            target: [
              permissionBindings.guildId,
              permissionBindings.permissionId,
              permissionBindings.roleId,
            ],
          });
      } else {
        const { permissionBindings } = sqliteSchema;
        const sqlite = client as DbClient<'sqlite'>;
        await sqlite.db
          .insert(permissionBindings)
          .values({
            guildId,
            permissionId,
            roleId,
          })
          .onConflictDoNothing({
            target: [
              permissionBindings.guildId,
              permissionBindings.permissionId,
              permissionBindings.roleId,
            ],
          });
      }
      cache.delete(guildId);
    },

    async unbind(guildId, permissionId, roleId) {
      if (client.driver === 'pg') {
        const { permissionBindings } = pgSchema;
        const pg = client as DbClient<'pg'>;
        await pg.db
          .delete(permissionBindings)
          .where(
            and(
              eq(permissionBindings.guildId, guildId),
              eq(permissionBindings.permissionId, permissionId),
              eq(permissionBindings.roleId, roleId),
            ),
          );
      } else {
        const { permissionBindings } = sqliteSchema;
        const sqlite = client as DbClient<'sqlite'>;
        await sqlite.db
          .delete(permissionBindings)
          .where(
            and(
              eq(permissionBindings.guildId, guildId),
              eq(permissionBindings.permissionId, permissionId),
              eq(permissionBindings.roleId, roleId),
            ),
          );
      }
      cache.delete(guildId);
    },
  };
}
