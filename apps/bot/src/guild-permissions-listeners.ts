import type { GuildId, UserId } from '@varde/contracts';
import type { GuildPermissionsService } from '@varde/core';
import type { Client, Role } from 'discord.js';

/**
 * Listeners Discord pour `guildPermissionsService` (jalon 7 PR 7.3
 * sub-livrable 4).
 *
 * Trois events câblés :
 *
 * - `roleDelete` → `service.cleanupDeletedRole(guildId, roleId)`.
 *   Si le role était dans la config, il est retiré ; si la liste
 *   admin devient vide, le service regénère le défaut. Le service
 *   logue les events d'audit `permissions.role.auto_removed` et
 *   `permissions.fallback_applied`.
 *
 * - `roleUpdate` → `service.invalidateGuild(guildId)`. Un role peut
 *   avoir gagné/perdu la perm Discord `Administrator` ; le défaut
 *   généré par `getConfig` peut donc évoluer. On purge tout le
 *   cache de la guild pour forcer une re-évaluation au prochain
 *   `getUserLevel`.
 *
 * - `guildMemberUpdate` → `service.invalidateMember(guildId, userId)`.
 *   Un user a pu gagner/perdre un rôle ; sa clé cache spécifique
 *   est invalidée.
 *
 * Le retour `detach()` détache tous les listeners — utile pour le
 * shutdown gracieux ou un swap de Client (cf.
 * `discordReconnectService` PR 7.2).
 */

export interface AttachGuildPermissionsListenersOptions {
  readonly client: Client;
  readonly service: GuildPermissionsService;
}

export interface GuildPermissionsListenersBinding {
  readonly detach: () => void;
}

/**
 * Capture l'erreur de `cleanupDeletedRole` plutôt que de la
 * propager — un échec transient (DB en erreur, p. ex.) ne doit
 * pas faire crasher l'event handler côté discord.js. Le service
 * lui-même est libre de retenter via le prochain event.
 */
const safeCleanup = async (
  service: GuildPermissionsService,
  guildId: GuildId,
  roleId: string,
): Promise<void> => {
  try {
    await service.cleanupDeletedRole(guildId, roleId);
  } catch {
    // Silencieux : on s'en remet au prochain événement ou à un
    // appel admin explicite.
  }
};

export function attachGuildPermissionsListeners(
  options: AttachGuildPermissionsListenersOptions,
): GuildPermissionsListenersBinding {
  const { client, service } = options;

  const onRoleDelete = (role: Role): void => {
    void safeCleanup(service, role.guild.id as GuildId, role.id);
  };

  const onRoleUpdate = (oldRole: Role, _newRole: Role): void => {
    service.invalidateGuild(oldRole.guild.id as GuildId);
  };

  const onMemberUpdate = (
    oldMember: { guild: { id: string }; id: string },
    _newMember: unknown,
  ): void => {
    service.invalidateMember(oldMember.guild.id as GuildId, oldMember.id as UserId);
  };

  client.on('roleDelete', onRoleDelete);
  client.on('roleUpdate', onRoleUpdate);
  client.on('guildMemberUpdate', onMemberUpdate);

  return {
    detach: () => {
      client.off('roleDelete', onRoleDelete);
      client.off('roleUpdate', onRoleUpdate);
      client.off('guildMemberUpdate', onMemberUpdate);
    },
  };
}
