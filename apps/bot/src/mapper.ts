import type { ChannelId, CoreEvent, GuildId, MessageId, RoleId, UserId } from '@varde/contracts';

/**
 * Traduction discord.js ↔ `CoreEvent` (contract @varde/contracts).
 *
 * Les entrées sont typées à partir des champs **extraits** des objets
 * discord.js (Member, Message, Channel, Role, Guild) par l'appelant.
 * Cette indirection permet de tester le mapping avec des fixtures JSON
 * sans monter un client Discord.
 *
 * Mapping V1 couvre les 14 événements Discord du catalogue
 * PR 1.1. Retour `null` si l'événement ne peut pas être mappé
 * proprement (ex. messageDelete sans auteur résolu, accepté mais
 * signalé par `authorId: null`).
 */

/** Identifiant kind côté discord.js. */
export type DiscordEventKind =
  | 'guildMemberAdd'
  | 'guildMemberRemove'
  | 'guildMemberUpdate'
  | 'messageCreate'
  | 'messageUpdate'
  | 'messageDelete'
  | 'channelCreate'
  | 'channelUpdate'
  | 'channelDelete'
  | 'roleCreate'
  | 'roleUpdate'
  | 'roleDelete'
  | 'guildCreate'
  | 'guildDelete';

interface GuildMemberAddInput {
  readonly kind: 'guildMemberAdd';
  readonly guildId: string;
  readonly userId: string;
  readonly joinedAt: number;
  readonly inviterId?: string;
}

interface GuildMemberRemoveInput {
  readonly kind: 'guildMemberRemove';
  readonly guildId: string;
  readonly userId: string;
  readonly leftAt: number;
}

interface GuildMemberUpdateInput {
  readonly kind: 'guildMemberUpdate';
  readonly guildId: string;
  readonly userId: string;
  readonly rolesAdded: readonly string[];
  readonly rolesRemoved: readonly string[];
  readonly nickBefore: string | null;
  readonly nickAfter: string | null;
  readonly updatedAt: number;
}

interface MessageCreateInput {
  readonly kind: 'messageCreate';
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly authorId: string;
  readonly content: string;
  readonly createdAt: number;
}

interface MessageUpdateInput {
  readonly kind: 'messageUpdate';
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly authorId: string;
  readonly contentBefore: string | null;
  readonly contentAfter: string;
  readonly editedAt: number;
}

interface MessageDeleteInput {
  readonly kind: 'messageDelete';
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly authorId: string | null;
  readonly deletedAt: number;
}

interface ChannelCreateInput {
  readonly kind: 'channelCreate';
  readonly guildId: string;
  readonly channelId: string;
  readonly createdAt: number;
}

interface ChannelUpdateInput {
  readonly kind: 'channelUpdate';
  readonly guildId: string;
  readonly channelId: string;
  readonly nameBefore: string;
  readonly nameAfter: string;
  readonly topicBefore: string | null;
  readonly topicAfter: string | null;
  readonly positionBefore: number;
  readonly positionAfter: number;
  readonly parentIdBefore: string | null;
  readonly parentIdAfter: string | null;
  readonly updatedAt: number;
}

interface ChannelDeleteInput {
  readonly kind: 'channelDelete';
  readonly guildId: string;
  readonly channelId: string;
  readonly deletedAt: number;
}

interface RoleCreateInput {
  readonly kind: 'roleCreate';
  readonly guildId: string;
  readonly roleId: string;
  readonly createdAt: number;
}

interface RoleUpdateInput {
  readonly kind: 'roleUpdate';
  readonly guildId: string;
  readonly roleId: string;
  readonly nameBefore: string;
  readonly nameAfter: string;
  readonly colorBefore: number;
  readonly colorAfter: number;
  readonly hoistBefore: boolean;
  readonly hoistAfter: boolean;
  readonly mentionableBefore: boolean;
  readonly mentionableAfter: boolean;
  readonly permissionsBefore: string;
  readonly permissionsAfter: string;
  readonly updatedAt: number;
}

interface RoleDeleteInput {
  readonly kind: 'roleDelete';
  readonly guildId: string;
  readonly roleId: string;
  readonly deletedAt: number;
}

interface GuildCreateInput {
  readonly kind: 'guildCreate';
  readonly guildId: string;
  readonly joinedAt: number;
}

interface GuildDeleteInput {
  readonly kind: 'guildDelete';
  readonly guildId: string;
  readonly leftAt: number;
}

/** Union typée des inputs de `mapDiscordEvent`. */
export type DiscordEventInput =
  | GuildMemberAddInput
  | GuildMemberRemoveInput
  | GuildMemberUpdateInput
  | MessageCreateInput
  | MessageUpdateInput
  | MessageDeleteInput
  | ChannelCreateInput
  | ChannelUpdateInput
  | ChannelDeleteInput
  | RoleCreateInput
  | RoleUpdateInput
  | RoleDeleteInput
  | GuildCreateInput
  | GuildDeleteInput;

/**
 * Mappe un événement discord.js (forme extraite) vers un `CoreEvent`.
 * Déterministe, sans effet de bord ; sortie figée.
 */
export function mapDiscordEvent(input: DiscordEventInput): CoreEvent {
  switch (input.kind) {
    case 'guildMemberAdd':
      return {
        type: 'guild.memberJoin',
        guildId: input.guildId as GuildId,
        userId: input.userId as UserId,
        joinedAt: input.joinedAt,
        ...(input.inviterId ? { inviterId: input.inviterId as UserId } : {}),
      };
    case 'guildMemberRemove':
      return {
        type: 'guild.memberLeave',
        guildId: input.guildId as GuildId,
        userId: input.userId as UserId,
        leftAt: input.leftAt,
      };
    case 'guildMemberUpdate':
      return {
        type: 'guild.memberUpdate',
        guildId: input.guildId as GuildId,
        userId: input.userId as UserId,
        rolesAdded: input.rolesAdded.map((r) => r as RoleId),
        rolesRemoved: input.rolesRemoved.map((r) => r as RoleId),
        nickBefore: input.nickBefore,
        nickAfter: input.nickAfter,
        updatedAt: input.updatedAt,
      };
    case 'messageCreate':
      return {
        type: 'guild.messageCreate',
        guildId: input.guildId as GuildId,
        channelId: input.channelId as ChannelId,
        messageId: input.messageId as MessageId,
        authorId: input.authorId as UserId,
        content: input.content,
        createdAt: input.createdAt,
      };
    case 'messageUpdate':
      return {
        type: 'guild.messageEdit',
        guildId: input.guildId as GuildId,
        channelId: input.channelId as ChannelId,
        messageId: input.messageId as MessageId,
        authorId: input.authorId as UserId,
        contentBefore: input.contentBefore,
        contentAfter: input.contentAfter,
        editedAt: input.editedAt,
      };
    case 'messageDelete':
      return {
        type: 'guild.messageDelete',
        guildId: input.guildId as GuildId,
        channelId: input.channelId as ChannelId,
        messageId: input.messageId as MessageId,
        authorId: input.authorId === null ? null : (input.authorId as UserId),
        deletedAt: input.deletedAt,
      };
    case 'channelCreate':
      return {
        type: 'guild.channelCreate',
        guildId: input.guildId as GuildId,
        channelId: input.channelId as ChannelId,
        createdAt: input.createdAt,
      };
    case 'channelUpdate':
      return {
        type: 'guild.channelUpdate',
        guildId: input.guildId as GuildId,
        channelId: input.channelId as ChannelId,
        nameBefore: input.nameBefore,
        nameAfter: input.nameAfter,
        topicBefore: input.topicBefore,
        topicAfter: input.topicAfter,
        positionBefore: input.positionBefore,
        positionAfter: input.positionAfter,
        parentIdBefore: input.parentIdBefore === null ? null : (input.parentIdBefore as ChannelId),
        parentIdAfter: input.parentIdAfter === null ? null : (input.parentIdAfter as ChannelId),
        updatedAt: input.updatedAt,
      };
    case 'channelDelete':
      return {
        type: 'guild.channelDelete',
        guildId: input.guildId as GuildId,
        channelId: input.channelId as ChannelId,
        deletedAt: input.deletedAt,
      };
    case 'roleCreate':
      return {
        type: 'guild.roleCreate',
        guildId: input.guildId as GuildId,
        roleId: input.roleId as RoleId,
        createdAt: input.createdAt,
      };
    case 'roleUpdate':
      return {
        type: 'guild.roleUpdate',
        guildId: input.guildId as GuildId,
        roleId: input.roleId as RoleId,
        nameBefore: input.nameBefore,
        nameAfter: input.nameAfter,
        colorBefore: input.colorBefore,
        colorAfter: input.colorAfter,
        hoistBefore: input.hoistBefore,
        hoistAfter: input.hoistAfter,
        mentionableBefore: input.mentionableBefore,
        mentionableAfter: input.mentionableAfter,
        permissionsBefore: input.permissionsBefore,
        permissionsAfter: input.permissionsAfter,
        updatedAt: input.updatedAt,
      };
    case 'roleDelete':
      return {
        type: 'guild.roleDelete',
        guildId: input.guildId as GuildId,
        roleId: input.roleId as RoleId,
        deletedAt: input.deletedAt,
      };
    case 'guildCreate':
      return {
        type: 'guild.join',
        guildId: input.guildId as GuildId,
        joinedAt: input.joinedAt,
      };
    case 'guildDelete':
      return {
        type: 'guild.leave',
        guildId: input.guildId as GuildId,
        leftAt: input.leftAt,
      };
  }
}
