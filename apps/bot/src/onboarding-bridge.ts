import type {
  DiscordCreateCategoryPayload,
  DiscordCreateChannelPayload,
  DiscordCreateResult,
  DiscordCreateRolePayload,
  DraftChannelType,
} from '@varde/contracts';
import {
  ChannelType,
  type Client,
  type Guild,
  OverwriteType,
  PermissionsBitField,
} from 'discord.js';

/**
 * Bridge discord.js → primitives onboarding (PR 3.12d). Matérialise
 * les méthodes `createRole` / `createCategory` / `createChannel` +
 * leurs undo sur l'API `guild.roles.*` / `guild.channels.*` d'un
 * Client discord.js v14.
 *
 * Le bridge ne capture pas de `guildId` à la construction : chaque
 * méthode en prend un en premier argument, puis résout la guild au
 * call time depuis `client.guilds.cache`. Ça laisse la construction
 * du bridge survenir avant `client.login()` — le Client est lazy
 * tant qu'aucun apply n'est lancé.
 *
 * Les suppressions sont idempotentes : une entité absente du cache
 * (rôle / salon déjà supprimé côté Discord) est silencieusement
 * ignorée. Ça évite de réveiller un rollback bruyant quand un admin
 * a déjà supprimé manuellement un objet créé par l'onboarding.
 *
 * Les erreurs Discord (permissions insuffisantes, hiérarchie de
 * rôles, etc.) sont propagées telles quelles — l'executor les
 * capture, marque l'action `failed` et enclenche le rollback auto.
 */

export interface OnboardingDiscordBridge {
  readonly createRole: (
    guildId: string,
    payload: DiscordCreateRolePayload,
  ) => Promise<DiscordCreateResult>;
  readonly deleteRole: (guildId: string, roleId: string) => Promise<void>;
  readonly createCategory: (
    guildId: string,
    payload: DiscordCreateCategoryPayload,
  ) => Promise<DiscordCreateResult>;
  readonly deleteCategory: (guildId: string, channelId: string) => Promise<void>;
  readonly createChannel: (
    guildId: string,
    payload: DiscordCreateChannelPayload,
  ) => Promise<DiscordCreateResult>;
  readonly deleteChannel: (guildId: string, channelId: string) => Promise<void>;
}

const toDiscordChannelType = (
  type: DraftChannelType,
): ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildForum => {
  switch (type) {
    case 'text':
      return ChannelType.GuildText;
    case 'voice':
      return ChannelType.GuildVoice;
    case 'forum':
      return ChannelType.GuildForum;
  }
};

export function createOnboardingDiscordBridge(client: Client): OnboardingDiscordBridge {
  const requireGuild = (guildId: string): Guild => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(
        `Discord guild "${guildId}" introuvable dans le cache du bot : s'assurer que le bot est invité et connecté.`,
      );
    }
    return guild;
  };

  return {
    async createRole(guildId, payload) {
      const guild = requireGuild(guildId);
      // discord.js v14.26 a déprécié `color` au profit de `colors`
      // (introduction des gradients Discord). On passe un
      // `primaryColor` pour rester compatible V1 — un vrai support
      // bi-color/tri-color n'est pas scope onboarding pour l'instant.
      const role = await guild.roles.create({
        name: payload.name,
        colors: { primaryColor: payload.color ?? 0 },
        hoist: payload.hoist ?? false,
        mentionable: payload.mentionable ?? false,
        ...(payload.permissions !== undefined
          ? { permissions: new PermissionsBitField(payload.permissions) }
          : {}),
      });
      return { id: role.id };
    },

    async deleteRole(guildId, roleId) {
      const guild = requireGuild(guildId);
      const role =
        guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
      if (!role) return;
      await role.delete();
    },

    async createCategory(guildId, payload) {
      const guild = requireGuild(guildId);
      const channel = await guild.channels.create({
        type: ChannelType.GuildCategory,
        name: payload.name,
        ...(payload.position !== undefined ? { position: payload.position } : {}),
      });
      return { id: channel.id };
    },

    async deleteCategory(guildId, channelId) {
      const guild = requireGuild(guildId);
      const channel =
        guild.channels.cache.get(channelId) ??
        (await guild.channels.fetch(channelId).catch(() => null));
      if (!channel) return;
      await channel.delete();
    },

    async createChannel(guildId, payload) {
      const guild = requireGuild(guildId);
      const discordType = toDiscordChannelType(payload.type);
      const permissionOverwrites =
        payload.permissionOverwrites && payload.permissionOverwrites.length > 0
          ? payload.permissionOverwrites.map((ow) => ({
              id: ow.roleId,
              type: OverwriteType.Role,
              ...(ow.allow !== undefined ? { allow: new PermissionsBitField(ow.allow) } : {}),
              ...(ow.deny !== undefined ? { deny: new PermissionsBitField(ow.deny) } : {}),
            }))
          : undefined;

      // discord.js tape les options de `channels.create` par overload
      // sur le type. On construit un objet strict puis on cast local
      // pour rester propre sans répéter la logique par type.
      const baseOptions = {
        type: discordType,
        name: payload.name,
        ...(payload.parentId !== undefined ? { parent: payload.parentId } : {}),
        ...(payload.topic !== undefined ? { topic: payload.topic } : {}),
        ...(discordType === ChannelType.GuildText && payload.slowmodeSeconds !== undefined
          ? { rateLimitPerUser: payload.slowmodeSeconds }
          : {}),
        ...(permissionOverwrites ? { permissionOverwrites } : {}),
      };
      const channel = await guild.channels.create(
        baseOptions as Parameters<Guild['channels']['create']>[0],
      );
      return { id: channel.id };
    },

    async deleteChannel(guildId, channelId) {
      const guild = requireGuild(guildId);
      const channel =
        guild.channels.cache.get(channelId) ??
        (await guild.channels.fetch(channelId).catch(() => null));
      if (!channel) return;
      await channel.delete();
    },
  };
}
