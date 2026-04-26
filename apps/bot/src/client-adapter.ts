import type {
  ButtonInteractionInput,
  ChannelId,
  GuildId,
  Logger,
  MessageId,
  ResolvedChannel,
  ResolvedCommandInput,
  ResolvedRole,
  ResolvedUser,
  RoleId,
  UIMessage,
  UserId,
} from '@varde/contracts';
import type {
  Channel,
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  Interaction,
  Message,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  Role,
  User,
} from 'discord.js';

import type { BotDispatcher } from './dispatcher.js';
import type { DiscordEventInput } from './mapper.js';

/**
 * Wiring concret discord.js ↔ `BotDispatcher`. Isolé du dispatcher
 * pour que la suite de tests n'importe jamais discord.js.
 *
 * Responsabilité :
 * 1. Enregistrer des handlers sur le Client discord.js pour chaque
 *    événement du catalogue V1 et les transformer en
 *    `DiscordEventInput` avant de passer la main au dispatcher.
 * 2. Enregistrer un handler d'interaction qui résout les
 *    slash commands via `dispatcher.dispatchCommand` et répond via
 *    `interaction.reply(...)` selon le `UIMessage` produit.
 *
 * Seule dépendance directe : discord.js (types + Client). Le reste
 * du bot ignore discord.js.
 */

interface AttachResult {
  /** Détache tous les listeners posés. Idempotent. */
  readonly detach: () => void;
}

/** Extrait le payload attendu par le mapper depuis un GuildMember. */
const memberAddInput = (member: GuildMember): DiscordEventInput => ({
  kind: 'guildMemberAdd',
  guildId: member.guild.id,
  userId: member.id,
  joinedAt: member.joinedTimestamp ?? Date.now(),
});

const memberRemoveInput = (member: GuildMember): DiscordEventInput => ({
  kind: 'guildMemberRemove',
  guildId: member.guild.id,
  userId: member.id,
  leftAt: Date.now(),
});

const memberUpdateInput = (oldMember: GuildMember, newMember: GuildMember): DiscordEventInput => {
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const rolesAdded = Array.from(newRoles).filter((r) => !oldRoles.has(r));
  const rolesRemoved = Array.from(oldRoles).filter((r) => !newRoles.has(r));
  return {
    kind: 'guildMemberUpdate',
    guildId: newMember.guild.id,
    userId: newMember.id,
    rolesAdded,
    rolesRemoved,
    nickBefore: oldMember.nickname,
    nickAfter: newMember.nickname,
    updatedAt: Date.now(),
  };
};

const messageCreateInput = (message: Message): DiscordEventInput | null => {
  if (!message.guildId) return null;
  return {
    kind: 'messageCreate',
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    authorId: message.author.id,
    content: message.content,
    createdAt: message.createdTimestamp,
  };
};

const messageUpdateInput = (oldMessage: Message, newMessage: Message): DiscordEventInput | null => {
  if (!newMessage.guildId) return null;
  return {
    kind: 'messageUpdate',
    guildId: newMessage.guildId,
    channelId: newMessage.channelId,
    messageId: newMessage.id,
    authorId: newMessage.author.id,
    contentBefore: oldMessage.content,
    contentAfter: newMessage.content,
    editedAt: newMessage.editedTimestamp ?? Date.now(),
  };
};

const messageDeleteInput = (message: Message): DiscordEventInput | null => {
  if (!message.guildId) return null;
  return {
    kind: 'messageDelete',
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    authorId: message.author?.id ?? null,
    deletedAt: Date.now(),
  };
};

const channelInput = (
  channel: Channel,
  kind: 'channelCreate' | 'channelDelete',
): DiscordEventInput | null => {
  if (!('guildId' in channel) || !channel.guildId) return null;
  const timestamp = Date.now();
  const timestampField =
    kind === 'channelCreate' ? { createdAt: timestamp } : { deletedAt: timestamp };
  return {
    kind,
    guildId: channel.guildId,
    channelId: channel.id,
    ...timestampField,
  } as DiscordEventInput;
};

const channelUpdateInput = (oldChannel: Channel, newChannel: Channel): DiscordEventInput | null => {
  if (!('guildId' in newChannel) || !newChannel.guildId) return null;
  // Les channels de guilde ont toujours name/position/parentId en discord.js v14.
  // `topic` n'existe que sur les channels textuels ; on normalise en null sinon.
  const anyOld = oldChannel as unknown as {
    name?: string;
    position?: number;
    parentId?: string | null;
    topic?: string | null;
  };
  const anyNew = newChannel as unknown as {
    id: string;
    guildId: string;
    name?: string;
    position?: number;
    parentId?: string | null;
    topic?: string | null;
  };
  const oldTopic = 'topic' in anyOld ? (anyOld.topic ?? null) : null;
  const newTopic = 'topic' in anyNew ? (anyNew.topic ?? null) : null;
  return {
    kind: 'channelUpdate',
    guildId: anyNew.guildId,
    channelId: anyNew.id,
    nameBefore: anyOld.name ?? '',
    nameAfter: anyNew.name ?? '',
    topicBefore: oldTopic,
    topicAfter: newTopic,
    positionBefore: anyOld.position ?? 0,
    positionAfter: anyNew.position ?? 0,
    parentIdBefore: anyOld.parentId ?? null,
    parentIdAfter: anyNew.parentId ?? null,
    updatedAt: Date.now(),
  };
};

const roleInput = (role: Role, kind: 'roleCreate' | 'roleDelete'): DiscordEventInput => {
  const timestamp = Date.now();
  const timestampField =
    kind === 'roleCreate' ? { createdAt: timestamp } : { deletedAt: timestamp };
  return {
    kind,
    guildId: role.guild.id,
    roleId: role.id,
    ...timestampField,
  } as DiscordEventInput;
};

const roleUpdateInput = (oldRole: Role, newRole: Role): DiscordEventInput => ({
  kind: 'roleUpdate',
  guildId: newRole.guild.id,
  roleId: newRole.id,
  nameBefore: oldRole.name,
  nameAfter: newRole.name,
  colorBefore: oldRole.color,
  colorAfter: newRole.color,
  hoistBefore: oldRole.hoist,
  hoistAfter: newRole.hoist,
  mentionableBefore: oldRole.mentionable,
  mentionableAfter: newRole.mentionable,
  permissionsBefore: oldRole.permissions.bitfield.toString(),
  permissionsAfter: newRole.permissions.bitfield.toString(),
  updatedAt: Date.now(),
});

const guildCreateInput = (guild: Guild): DiscordEventInput => ({
  kind: 'guildCreate',
  guildId: guild.id,
  joinedAt: guild.joinedTimestamp ?? Date.now(),
});

const guildDeleteInput = (guild: Guild): DiscordEventInput => ({
  kind: 'guildDelete',
  guildId: guild.id,
  leftAt: Date.now(),
});

const reactionInput = (
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  kind: 'messageReactionAdd' | 'messageReactionRemove',
): DiscordEventInput | null => {
  const guildId = reaction.message.guildId;
  if (!guildId) return null;
  const emojiNode = reaction.emoji;
  const emoji = emojiNode.id
    ? {
        type: 'custom' as const,
        id: emojiNode.id,
        name: emojiNode.name ?? '',
        animated: emojiNode.animated ?? false,
      }
    : {
        type: 'unicode' as const,
        value: emojiNode.name ?? '',
      };
  return {
    kind,
    guildId,
    channelId: reaction.message.channelId,
    messageId: reaction.message.id,
    userId: user.id,
    emoji,
    reactedAt: Date.now(),
  };
};

/**
 * Routeur d'interactions bouton. Reçoit un click et retourne un
 * `UIMessage` rendu en réponse éphémère, ou `null` si aucun handler
 * ne matche (le bot accuse alors silencieusement réception). Wiré
 * sur `CoreInteractionsRegistry.dispatchButton` côté server.
 */
export type ButtonDispatcher = (input: ButtonInteractionInput) => Promise<UIMessage | null>;

/**
 * Attache les handlers discord.js au dispatcher. Retourne une
 * fonction `detach` à appeler au shutdown pour retirer proprement
 * les listeners (utile en tests et pour hot-reload post-V1).
 *
 * `dispatchButton` est optionnel : sans lui, les `interactionCreate`
 * de type bouton sont ignorés silencieusement (utile pour les tests
 * qui ne couvrent que les commandes).
 */
export function attachDiscordClient(
  client: Client,
  dispatcher: BotDispatcher,
  logger: Logger,
  dispatchButton?: ButtonDispatcher,
): AttachResult {
  const log = logger.child({ component: 'client-adapter' });

  const dispatch = (input: DiscordEventInput | null): void => {
    if (!input) return;
    void dispatcher.dispatchEvent(input);
  };

  const listeners: { readonly event: string; readonly handler: (...args: unknown[]) => void }[] =
    [];

  const on = (event: string, handler: (...args: unknown[]) => void): void => {
    listeners.push({ event, handler });
    client.on(event, handler);
  };

  on('guildMemberAdd', (member) => dispatch(memberAddInput(member as GuildMember)));
  on('guildMemberRemove', (member) => dispatch(memberRemoveInput(member as GuildMember)));
  on('guildMemberUpdate', (oldMember, newMember) =>
    dispatch(memberUpdateInput(oldMember as GuildMember, newMember as GuildMember)),
  );
  on('messageCreate', (message) => dispatch(messageCreateInput(message as Message)));
  on('messageUpdate', (oldMessage, newMessage) =>
    dispatch(messageUpdateInput(oldMessage as Message, newMessage as Message)),
  );
  on('messageDelete', (message) => dispatch(messageDeleteInput(message as Message)));
  on('channelCreate', (channel) => dispatch(channelInput(channel as Channel, 'channelCreate')));
  on('channelUpdate', (oldChannel, newChannel) =>
    dispatch(channelUpdateInput(oldChannel as Channel, newChannel as Channel)),
  );
  on('channelDelete', (channel) => dispatch(channelInput(channel as Channel, 'channelDelete')));
  on('roleCreate', (role) => dispatch(roleInput(role as Role, 'roleCreate')));
  on('roleUpdate', (oldRole, newRole) =>
    dispatch(roleUpdateInput(oldRole as Role, newRole as Role)),
  );
  on('roleDelete', (role) => dispatch(roleInput(role as Role, 'roleDelete')));
  on('guildCreate', (guild) => dispatch(guildCreateInput(guild as Guild)));
  on('guildDelete', (guild) => dispatch(guildDeleteInput(guild as Guild)));
  on('messageReactionAdd', (reaction, user) =>
    dispatch(reactionInput(reaction as MessageReaction, user as User, 'messageReactionAdd')),
  );
  on('messageReactionRemove', (reaction, user) =>
    dispatch(reactionInput(reaction as MessageReaction, user as User, 'messageReactionRemove')),
  );

  // Interaction routing.
  const handleChatInputCommand = async (
    interaction: ChatInputCommandInteraction,
  ): Promise<void> => {
    const guildId = interaction.guildId;
    if (!guildId) return;
    try {
      const result = await dispatcher.dispatchCommand({
        commandName: interaction.commandName,
        guildId: guildId as GuildId,
        channelId: interaction.channelId as ChannelId,
        userId: interaction.user.id as UserId,
        options: extractCommandOptions(interaction),
        resolved: extractResolved(interaction),
      });
      // Rendu texte plat V1 basé sur le kind.
      const content = renderUIMessage(result as UIMessageLike);
      await interaction.reply({ content, ephemeral: result.kind === 'error' });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('interaction handler a échoué', err, {
        commandName: interaction.commandName,
      });
      if (!interaction.replied) {
        await interaction.reply({ content: 'Erreur interne.', ephemeral: true }).catch(() => {});
      }
    }
  };

  /**
   * Click sur un bouton Discord. Toujours répondu en éphémère — c'est
   * la valeur ajoutée des composants par rapport aux réactions emoji.
   * Si aucun handler ne matche, on accuse silencieusement réception
   * pour éviter le spinner « cette interaction a échoué » dans le
   * client Discord.
   */
  const handleButton = async (
    interaction: import('discord.js').ButtonInteraction,
  ): Promise<void> => {
    if (!dispatchButton) {
      // Pas de routeur câblé → on accuse réception poliment.
      await interaction.deferUpdate().catch(() => {});
      return;
    }
    const guildId = interaction.guildId;
    if (!guildId || !interaction.message) {
      await interaction.deferUpdate().catch(() => {});
      return;
    }
    try {
      const result = await dispatchButton({
        guildId: guildId as GuildId,
        channelId: interaction.channelId as ChannelId,
        messageId: interaction.message.id as MessageId,
        userId: interaction.user.id as UserId,
        customId: interaction.customId,
      });
      if (result === null) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }
      const content = renderUIMessage(result as UIMessageLike);
      await interaction.reply({ content, ephemeral: true });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('button interaction handler a échoué', err, {
        customId: interaction.customId,
      });
      if (!interaction.replied) {
        await interaction.reply({ content: 'Erreur interne.', ephemeral: true }).catch(() => {});
      }
    }
  };

  const interactionHandler = async (interaction: Interaction): Promise<void> => {
    if (interaction.isChatInputCommand() && interaction.inGuild()) {
      await handleChatInputCommand(interaction);
      return;
    }
    if (interaction.isButton() && interaction.inGuild()) {
      await handleButton(interaction);
      return;
    }
  };
  client.on('interactionCreate', interactionHandler as (...args: unknown[]) => void);
  listeners.push({
    event: 'interactionCreate',
    handler: interactionHandler as (...args: unknown[]) => void,
  });

  return {
    detach() {
      for (const { event, handler } of listeners) {
        client.off(event, handler);
      }
    },
  };
}

interface UIMessageLike {
  readonly kind: string;
  readonly payload: {
    readonly title?: string;
    readonly description?: string;
    readonly message?: string;
  };
}

/** Rendu V1 d'un UIMessage en texte plat pour interaction.reply. */
const renderUIMessage = (message: UIMessageLike): string => {
  switch (message.kind) {
    case 'success':
    case 'error':
      return message.payload.message ?? '';
    case 'embed':
      return [message.payload.title, message.payload.description].filter(Boolean).join('\n');
    case 'confirm':
      return message.payload.message ?? '';
    default:
      return '';
  }
};

/**
 * Aplatit `interaction.options.data` en `Record<name, value>` pour
 * `CommandInteractionInput.options`. Le champ `value` discord.js
 * porte la valeur primitive ou le snowflake selon le type d'option
 * (3=string, 4=integer, 5=boolean, 6=user, 7=channel, 8=role,
 * 10=number) — discord.js le pose toujours pour ces 7 types. Les
 * sous-commandes (1, 2) ne sont pas exposées en V1, on les ignore.
 *
 * Pour les types user/role/channel, `value` contient le snowflake en
 * string ; les détails enrichis (tag, name, position) sont dans
 * `extractResolved`.
 */
const extractCommandOptions = (
  interaction: ChatInputCommandInteraction,
): Record<string, string | number | boolean> => {
  const out: Record<string, string | number | boolean> = {};
  for (const opt of interaction.options.data) {
    if (opt.value === undefined || opt.value === null) continue;
    if (
      typeof opt.value === 'string' ||
      typeof opt.value === 'number' ||
      typeof opt.value === 'boolean'
    ) {
      out[opt.name] = opt.value;
    }
  }
  return out;
};

/**
 * Construit un `ResolvedCommandInput` depuis `interaction.options.resolved`
 * (discord.js v14). Les Collections sont traduites en Records indexés par
 * snowflake. `displayName` cascade `member.displayName` → `user.globalName`
 * → `user.username` → `user.tag` pour ne jamais être vide. Les rôles
 * `@everyone` peuvent ne pas avoir de position dans la collection — on
 * tombe sur 0 dans ce cas.
 */
const extractResolved = (interaction: ChatInputCommandInteraction): ResolvedCommandInput => {
  const resolved = interaction.options.resolved;
  const users: Record<UserId, ResolvedUser> = {};
  const roles: Record<RoleId, ResolvedRole> = {};
  const channels: Record<ChannelId, ResolvedChannel> = {};

  if (resolved?.users) {
    for (const [snowflake, user] of resolved.users) {
      if (!user) continue;
      const member = resolved.members?.get(snowflake);
      const memberDisplay =
        member && 'displayName' in member && typeof member.displayName === 'string'
          ? member.displayName
          : null;
      const displayName =
        memberDisplay && memberDisplay.length > 0
          ? memberDisplay
          : (user.globalName ?? user.username ?? user.tag);
      users[snowflake as UserId] = {
        id: snowflake as UserId,
        tag: user.tag,
        displayName,
        isBot: user.bot,
      };
    }
  }

  if (resolved?.roles) {
    for (const [snowflake, role] of resolved.roles) {
      if (!role) continue;
      roles[snowflake as RoleId] = {
        id: snowflake as RoleId,
        name: role.name,
        position: typeof role.position === 'number' ? role.position : 0,
      };
    }
  }

  if (resolved?.channels) {
    for (const [snowflake, channel] of resolved.channels) {
      if (!channel) continue;
      channels[snowflake as ChannelId] = {
        id: snowflake as ChannelId,
        name: 'name' in channel && typeof channel.name === 'string' ? channel.name : '',
        type: typeof channel.type === 'number' ? channel.type : -1,
      };
    }
  }

  return { users, roles, channels };
};
