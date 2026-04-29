import {
  type ActionId,
  type AuditActor,
  type GuildId,
  type PermissionLevel,
  type UserId,
  ValidationError,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { eq } from 'drizzle-orm';

import type { CoreAuditService } from './audit.js';

/**
 * `guildPermissionsService` (jalon 7 PR 7.3). Mappe rôles Discord
 * → niveau de permission (`admin` | `moderator`) par guild.
 *
 * Backé par la table `guild_permissions` (cf. schemas).
 *
 * Service séparé du `permissionService` historique
 * (`packages/core/src/permission.ts`) qui gère les **permissions
 * applicatives par module** (e.g. « peut bannir »). Ici on gère
 * uniquement la frontière **dashboard** (`admin` complet vs
 * `moderator` filtré). Les deux services sont indépendants : un
 * user `admin` côté dashboard a tous les modules visibles ;
 * l'accès aux actions individuelles d'un module reste régi par le
 * `permissionService`.
 *
 * **Edge cases couverts** :
 *
 * - Pas de config en DB → génère et persiste le défaut (rôles
 *   avec perm Discord `Administrator`). Migration transparente
 *   pour les serveurs existants (cf. spec section 9).
 * - Owner Discord du serveur → toujours `admin`, indépendamment
 *   de la config (filet de sécurité contre lock-out admin).
 * - `cleanupDeletedRole` : retire un role ID des deux listes
 *   après suppression Discord. Si la liste admin devient vide,
 *   regénère le défaut et logue un event d'audit
 *   `permissions.fallback_applied`.
 *
 * **Pas de cache dans cette PR** : le cache LRU + invalidation par
 * events Discord est livré par sub-livrable 4. Pour les tests
 * unitaires de cette première étape, chaque call hit la DB.
 */

/** Forme persistée de la config par guild. */
export interface GuildPermissionsConfig {
  readonly adminRoleIds: readonly string[];
  readonly moderatorRoleIds: readonly string[];
}

/** Patch d'update — les deux listes sont remplacées en bloc. */
export interface GuildPermissionsPatch {
  readonly adminRoleIds: readonly string[];
  readonly moderatorRoleIds: readonly string[];
}

/**
 * Adaptateur Discord injecté par le runtime (`apps/server/src/bin.ts`).
 * Tests unitaires : passer un fake. La séparation laisse le service
 * du core indépendant de discord.js.
 */
export interface GuildPermissionsContext {
  /**
   * Liste des role IDs Discord qui ont la perm `Administrator` sur
   * la guild. Sert au fallback automatique quand pas de config en DB.
   */
  readonly getAdminRoleIds: (guildId: GuildId) => Promise<readonly string[]>;
  /**
   * ID du propriétaire Discord de la guild. `null` si la guild
   * n'est pas dans le cache du Client (jamais joinée ou cache pas
   * encore peuplé).
   */
  readonly getOwnerId: (guildId: GuildId) => Promise<UserId | null>;
  /**
   * Liste des role IDs portés par un user dans la guild. Vide si
   * l'user n'est pas membre (ou pas en cache).
   */
  readonly getUserRoleIds: (guildId: GuildId, userId: UserId) => Promise<readonly string[]>;
}

export interface GuildPermissionsService {
  readonly getConfig: (guildId: GuildId) => Promise<GuildPermissionsConfig>;
  readonly updateConfig: (
    guildId: GuildId,
    patch: GuildPermissionsPatch,
    actor: AuditActor,
  ) => Promise<GuildPermissionsConfig>;
  readonly getUserLevel: (guildId: GuildId, userId: UserId) => Promise<PermissionLevel | null>;
  readonly canAccessModule: (
    guildId: GuildId,
    userId: UserId,
    requiredPermission: PermissionLevel,
  ) => Promise<boolean>;
  /**
   * Retire un role ID des deux listes après suppression Discord.
   * Si la liste admin devient vide post-cleanup, regénère le défaut
   * (rôles `Administrator`) et logue un event d'audit.
   */
  readonly cleanupDeletedRole: (guildId: GuildId, roleId: string) => Promise<void>;
}

export interface CreateGuildPermissionsServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly context: GuildPermissionsContext;
  readonly audit?: CoreAuditService;
}

const validatePatch = (patch: GuildPermissionsPatch): void => {
  if (patch.adminRoleIds.length === 0) {
    throw new ValidationError('guildPermissionsService : adminRoleIds ne peut pas être vide');
  }
  const adminSet = new Set(patch.adminRoleIds);
  for (const id of patch.moderatorRoleIds) {
    if (adminSet.has(id)) {
      throw new ValidationError(
        `guildPermissionsService : le role ${id} ne peut pas être à la fois admin et moderator`,
        { metadata: { roleId: id } },
      );
    }
  }
  // Dédup interne — un role apparaît au plus une fois par liste.
  if (patch.adminRoleIds.length !== adminSet.size) {
    throw new ValidationError('guildPermissionsService : adminRoleIds contient des doublons');
  }
  if (patch.moderatorRoleIds.length !== new Set(patch.moderatorRoleIds).size) {
    throw new ValidationError('guildPermissionsService : moderatorRoleIds contient des doublons');
  }
};

interface RawRow {
  readonly adminRoleIds: readonly string[];
  readonly moderatorRoleIds: readonly string[];
}

const selectRow = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
): Promise<RawRow | null> => {
  if (client.driver === 'pg') {
    const { guildPermissions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({
        adminRoleIds: guildPermissions.adminRoleIds,
        moderatorRoleIds: guildPermissions.moderatorRoleIds,
      })
      .from(guildPermissions)
      .where(eq(guildPermissions.guildId, guildId))
      .limit(1);
    return rows[0] ?? null;
  }
  const { guildPermissions } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select({
      adminRoleIds: guildPermissions.adminRoleIds,
      moderatorRoleIds: guildPermissions.moderatorRoleIds,
    })
    .from(guildPermissions)
    .where(eq(guildPermissions.guildId, guildId))
    .limit(1)
    .get();
  return row ?? null;
};

const upsertRow = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
  patch: GuildPermissionsPatch,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { guildPermissions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const now = new Date();
    await pg.db
      .insert(guildPermissions)
      .values({
        guildId,
        adminRoleIds: patch.adminRoleIds,
        moderatorRoleIds: patch.moderatorRoleIds,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: guildPermissions.guildId,
        set: {
          adminRoleIds: patch.adminRoleIds,
          moderatorRoleIds: patch.moderatorRoleIds,
          updatedAt: now,
        },
      });
    return;
  }
  const { guildPermissions } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const now = toCanonicalDate(new Date());
  await sqlite.db
    .insert(guildPermissions)
    .values({
      guildId,
      adminRoleIds: patch.adminRoleIds,
      moderatorRoleIds: patch.moderatorRoleIds,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: guildPermissions.guildId,
      set: {
        adminRoleIds: patch.adminRoleIds,
        moderatorRoleIds: patch.moderatorRoleIds,
        updatedAt: now,
      },
    });
};

export function createGuildPermissionsService<D extends DbDriver>(
  options: CreateGuildPermissionsServiceOptions<D>,
): GuildPermissionsService {
  const { client, context, audit } = options;

  /**
   * Si `getConfig` n'a pas trouvé de row, on génère et **persiste**
   * un default basé sur les rôles Administrator. Si la liste est
   * vide (cas dégénéré : guild sans rôles admin connus côté
   * Discord — peut arriver si le cache n'est pas encore peuplé),
   * on retourne le default sans persister, pour qu'un appel
   * ultérieur (cache peuplé) puisse réessayer.
   */
  const buildAndPersistDefault = async (guildId: GuildId): Promise<GuildPermissionsConfig> => {
    const adminRoleIds = await context.getAdminRoleIds(guildId);
    const config: GuildPermissionsConfig = {
      adminRoleIds,
      moderatorRoleIds: [],
    };
    if (adminRoleIds.length === 0) {
      // Pas de rôle admin Discord → on retourne le default éphémère.
      // Le prochain appel re-tentera (cache peuplé entre-temps).
      return config;
    }
    await upsertRow(client, guildId, config);
    return config;
  };

  const readConfig = async (guildId: GuildId): Promise<GuildPermissionsConfig> => {
    const row = await selectRow(client, guildId);
    if (row !== null) {
      return { adminRoleIds: row.adminRoleIds, moderatorRoleIds: row.moderatorRoleIds };
    }
    return buildAndPersistDefault(guildId);
  };

  return {
    getConfig: readConfig,

    async updateConfig(guildId, patch, actor) {
      validatePatch(patch);
      const before = await readConfig(guildId);
      await upsertRow(client, guildId, patch);
      // Audit : diff before/after pour traçabilité ; cf. spec § 10.
      await audit?.log({
        guildId,
        action: 'permissions.updated' as ActionId,
        actor,
        severity: 'warn',
        metadata: {
          before: {
            adminRoleIds: before.adminRoleIds,
            moderatorRoleIds: before.moderatorRoleIds,
          },
          after: {
            adminRoleIds: patch.adminRoleIds,
            moderatorRoleIds: patch.moderatorRoleIds,
          },
        },
      });
      return { adminRoleIds: patch.adminRoleIds, moderatorRoleIds: patch.moderatorRoleIds };
    },

    async getUserLevel(guildId, userId) {
      // Owner Discord du serveur → toujours admin (filet de sécurité
      // contre lock-out, cf. spec § 7).
      const ownerId = await context.getOwnerId(guildId);
      if (ownerId === userId) {
        return 'admin';
      }
      const config = await readConfig(guildId);
      const userRoleIds = await context.getUserRoleIds(guildId, userId);
      if (userRoleIds.length === 0) {
        return null;
      }
      const userRoleSet = new Set<string>(userRoleIds);
      if (config.adminRoleIds.some((rid) => userRoleSet.has(rid))) {
        return 'admin';
      }
      if (config.moderatorRoleIds.some((rid) => userRoleSet.has(rid))) {
        return 'moderator';
      }
      return null;
    },

    async canAccessModule(guildId, userId, requiredPermission) {
      const level = await this.getUserLevel(guildId, userId);
      if (level === null) return false;
      // `admin` peut accéder à tous les niveaux ; `moderator`
      // n'accède qu'aux modules qui demandent `'moderator'`.
      if (level === 'admin') return true;
      return requiredPermission === 'moderator';
    },

    async cleanupDeletedRole(guildId, roleId) {
      const row = await selectRow(client, guildId);
      if (row === null) {
        // Pas de config persistée — rien à nettoyer.
        return;
      }
      const adminWithoutRole = row.adminRoleIds.filter((id) => id !== roleId);
      const moderatorWithoutRole = row.moderatorRoleIds.filter((id) => id !== roleId);
      const adminChanged = adminWithoutRole.length !== row.adminRoleIds.length;
      const moderatorChanged = moderatorWithoutRole.length !== row.moderatorRoleIds.length;
      if (!adminChanged && !moderatorChanged) {
        return;
      }
      // Si la liste admin devient vide, regénère le défaut (rôles
      // Administrator) et logue `permissions.fallback_applied`.
      let nextAdmin: readonly string[] = adminWithoutRole;
      let fallbackApplied = false;
      if (nextAdmin.length === 0) {
        nextAdmin = await context.getAdminRoleIds(guildId);
        fallbackApplied = nextAdmin.length > 0;
      }
      await upsertRow(client, guildId, {
        adminRoleIds: nextAdmin,
        moderatorRoleIds: moderatorWithoutRole,
      });
      await audit?.log({
        guildId,
        action: 'permissions.role.auto_removed' as ActionId,
        actor: { type: 'system' },
        severity: 'info',
        metadata: { roleId, adminChanged, moderatorChanged },
      });
      if (fallbackApplied) {
        await audit?.log({
          guildId,
          action: 'permissions.fallback_applied' as ActionId,
          actor: { type: 'system' },
          severity: 'warn',
          metadata: { regeneratedAdminRoleIds: nextAdmin },
        });
      }
    },
  };
}
