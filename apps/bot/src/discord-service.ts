import {
  type ChannelId,
  DependencyFailureError,
  DiscordSendError,
  type DiscordSendErrorReason,
  type DiscordService,
  type Emoji,
  type GuildId,
  type Logger,
  type MessageId,
  type ModuleId,
  type RoleId,
  type UIMessage,
  type UserId,
} from '@varde/contracts';
import type { Client } from 'discord.js';

/**
 * Implémentation concrète du `DiscordService` : un wrapper minimal
 * autour d'un port `ChannelSender` qui abstrait discord.js. Le bot
 * injecte le vrai sender relié au client discord.js ; les tests
 * injectent un sender fake.
 *
 * Rate limiting V1 : fenêtre glissante (sliding window) par instance
 * du service, partagée entre `sendMessage` et `sendEmbed` (le coût
 * Discord d'un envoi est le même qu'on attache un embed ou non). Le
 * ctx factory produit un service par module — c'est ce qui donne la
 * granularité "par module" demandée par le plan.
 */

/** Port minimal vers discord.js. Production : `channel.send(...)`. */
export interface ChannelSender {
  readonly sendMessage: (channelId: ChannelId, content: string) => Promise<void>;
  readonly sendEmbed: (channelId: ChannelId, message: UIMessage) => Promise<void>;
}

/** Paramètres du rate limiter interne. Omission = pas de limitation. */
export interface RateLimitConfig {
  readonly tokens: number;
  readonly windowMs: number;
}

/** Options de construction. */
export interface CreateDiscordServiceOptions {
  readonly sender: ChannelSender;
  readonly logger: Logger;
  readonly moduleId?: ModuleId;
  readonly rateLimit?: RateLimitConfig;
  /** Horloge injectable (tests). Défaut : `Date.now`. */
  readonly now?: () => number;
  /**
   * Client discord.js. Requis pour les méthodes qui accèdent
   * directement aux messages/réactions (addReaction, removeUserReaction,
   * removeOwnReaction). Optionnel pour rester rétrocompatible avec les
   * tests qui ne couvrent que sendMessage/sendEmbed.
   */
  readonly client?: Client;
}

interface SlidingWindow {
  readonly limit: number;
  readonly windowMs: number;
  readonly hits: number[];
}

const createWindow = (config: RateLimitConfig): SlidingWindow => ({
  limit: config.tokens,
  windowMs: config.windowMs,
  hits: [],
});

/** Consomme un crédit si la fenêtre le permet, sinon retourne false. */
const consume = (window: SlidingWindow, nowMs: number): boolean => {
  const cutoff = nowMs - window.windowMs;
  // Retire les hits plus anciens que la fenêtre.
  while (window.hits.length > 0 && (window.hits[0] ?? 0) <= cutoff) {
    window.hits.shift();
  }
  if (window.hits.length >= window.limit) {
    return false;
  }
  window.hits.push(nowMs);
  return true;
};

/**
 * Codes d'erreur Discord (REST API v10) mappés sur nos raisons typées.
 * - 10003 = Unknown Channel
 * - 10008 = Unknown Message
 * - 10014 = Unknown Emoji
 * - 20028 = Slow Mode
 * - 50001 = Missing Access
 * - 50013 = Missing Permissions
 * - 429  = Rate Limited (HTTP)
 */
const DISCORD_CODE_TO_REASON: Readonly<Record<number, DiscordSendErrorReason>> = Object.freeze({
  10003: 'channel-not-found',
  10008: 'message-not-found',
  10014: 'emoji-not-found',
  20028: 'rate-limit-exhausted',
  50001: 'missing-permission',
  50013: 'missing-permission',
  429: 'rate-limit-exhausted',
});

const classifyError = (error: unknown): DiscordSendErrorReason => {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'number' && code in DISCORD_CODE_TO_REASON) {
      return DISCORD_CODE_TO_REASON[code] ?? 'unknown';
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      if (/unknown channel/i.test(message)) return 'channel-not-found';
      if (/missing permissions?/i.test(message)) return 'missing-permission';
    }
  }
  return 'unknown';
};

/** Forme minimale d'une réaction discord.js dont on a besoin. */
interface ReactionLike {
  readonly emoji: { readonly id: string | null; readonly name: string | null };
  readonly users: { remove: (userId: string) => Promise<unknown> };
}

/** Forme minimale d'un Message discord.js dont on a besoin. */
interface MessageLike {
  readonly react: (emoji: string) => Promise<unknown>;
  readonly reactions: {
    readonly cache: Map<string, ReactionLike>;
  };
}

/** Forme minimale d'un salon texte discord.js pour fetch de messages. */
interface TextChannelLike {
  readonly messages: {
    readonly fetch: (id: string) => Promise<MessageLike>;
  };
  /** `send` est disponible sur les salons textuels ; retourne un Message. */
  readonly send?: (content: string) => Promise<{ readonly id: string }>;
}

/** Forme minimale d'un GuildMember discord.js dont on a besoin. */
interface GuildMemberLike {
  readonly roles: {
    readonly cache: { has: (roleId: string) => boolean };
    readonly add: (roleId: string) => Promise<unknown>;
    readonly remove: (roleId: string) => Promise<unknown>;
  };
}

/** Forme minimale d'une Guild discord.js pour la gestion des membres. */
interface GuildLike {
  readonly members: {
    readonly fetch: (userId: string) => Promise<GuildMemberLike>;
  };
  readonly roles: {
    readonly create: (options: {
      readonly name: string;
      readonly mentionable?: boolean;
      readonly hoist?: boolean;
      /** discord.js v14.26+ : couleurs via `colors.primaryColor`. */
      readonly colors?: { readonly primaryColor?: number };
    }) => Promise<{ readonly id: string }>;
  };
}

/**
 * Construit un `DiscordService`. Chaque instance a son propre état de
 * rate limiting ; produire un service par module donne l'isolation
 * demandée par le plan.
 */
export function createDiscordService(options: CreateDiscordServiceOptions): DiscordService {
  const { sender, moduleId, client } = options;
  const logger = options.logger.child({
    component: 'discord-service',
    ...(moduleId ? { moduleId } : {}),
  });
  const clock = options.now ?? (() => Date.now());
  const window = options.rateLimit ? createWindow(options.rateLimit) : null;

  return {
    async sendMessage(channelId, content) {
      if (window && !consume(window, clock())) {
        throw new DependencyFailureError('DiscordService : rate limit applicatif atteint', {
          metadata: {
            ...(moduleId ? { moduleId } : {}),
            limit: window.limit,
            windowMs: window.windowMs,
          },
        });
      }
      try {
        await sender.sendMessage(channelId, content);
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        logger.warn('sendMessage a échoué', { channelId, error: cause.message });
        throw new DependencyFailureError('DiscordService.sendMessage : échec en aval', {
          cause,
          metadata: {
            ...(moduleId ? { moduleId } : {}),
            channelId,
          },
        });
      }
    },

    async sendEmbed(channelId, message) {
      if (message.kind !== 'embed') {
        throw new TypeError(
          `DiscordService.sendEmbed : UIMessage attendu de kind='embed', reçu kind='${message.kind}'.`,
        );
      }
      if (window && !consume(window, clock())) {
        throw new DiscordSendError(
          'rate-limit-exhausted',
          'DiscordService : rate limit applicatif atteint',
          {
            metadata: {
              ...(moduleId ? { moduleId } : {}),
              limit: window.limit,
              windowMs: window.windowMs,
            },
          },
        );
      }
      try {
        await sender.sendEmbed(channelId, message);
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        const reason = classifyError(error);
        logger.warn('sendEmbed a échoué', { channelId, reason, error: cause.message });
        throw new DiscordSendError(reason, `DiscordService.sendEmbed : ${cause.message}`, {
          cause,
          metadata: {
            ...(moduleId ? { moduleId } : {}),
            channelId,
          },
        });
      }
    },

    async addReaction(channelId: ChannelId, messageId: MessageId, emoji: Emoji): Promise<void> {
      const channel = client?.channels.cache.get(channelId);
      if (!channel || !('messages' in channel)) {
        throw new DiscordSendError(
          'channel-not-found',
          'DiscordService.addReaction : salon introuvable',
        );
      }
      const textChannel = channel as TextChannelLike;
      let message: MessageLike;
      try {
        message = await textChannel.messages.fetch(messageId);
      } catch {
        throw new DiscordSendError(
          'message-not-found',
          'DiscordService.addReaction : message introuvable',
        );
      }
      const emojiApiId = emoji.type === 'unicode' ? emoji.value : `${emoji.name}:${emoji.id}`;
      try {
        await message.react(emojiApiId);
      } catch (err) {
        const reason = classifyError(err);
        throw new DiscordSendError(
          reason,
          `DiscordService.addReaction : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async removeUserReaction(
      channelId: ChannelId,
      messageId: MessageId,
      userId: UserId,
      emoji: Emoji,
    ): Promise<void> {
      const channel = client?.channels.cache.get(channelId);
      if (!channel || !('messages' in channel)) {
        throw new DiscordSendError(
          'channel-not-found',
          'DiscordService.removeUserReaction : salon introuvable',
        );
      }
      const textChannel = channel as TextChannelLike;
      let message: MessageLike;
      try {
        message = await textChannel.messages.fetch(messageId);
      } catch {
        throw new DiscordSendError(
          'message-not-found',
          'DiscordService.removeUserReaction : message introuvable',
        );
      }
      const reaction = [...message.reactions.cache.values()].find((r) => {
        if (emoji.type === 'unicode') return r.emoji.name === emoji.value;
        return r.emoji.id === emoji.id;
      });
      if (!reaction) return;
      try {
        await reaction.users.remove(userId);
      } catch (err) {
        const reason = classifyError(err);
        throw new DiscordSendError(
          reason,
          `DiscordService.removeUserReaction : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async removeOwnReaction(
      channelId: ChannelId,
      messageId: MessageId,
      emoji: Emoji,
    ): Promise<void> {
      const botUserId = client?.user?.id;
      if (!botUserId) {
        throw new DiscordSendError(
          'unknown',
          'DiscordService.removeOwnReaction : client non connecté',
        );
      }
      await this.removeUserReaction(channelId, messageId, botUserId as UserId, emoji);
    },

    async addMemberRole(guildId: GuildId, userId: UserId, roleId: RoleId): Promise<void> {
      const guild = client?.guilds.cache.get(guildId) as GuildLike | undefined;
      if (!guild) {
        throw new DiscordSendError('unknown', 'DiscordService.addMemberRole : guild introuvable');
      }
      let member: GuildMemberLike;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        throw new DiscordSendError('unknown', 'DiscordService.addMemberRole : membre introuvable');
      }
      try {
        await member.roles.add(roleId);
      } catch (err) {
        const reason = classifyError(err);
        throw new DiscordSendError(
          reason,
          `DiscordService.addMemberRole : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async removeMemberRole(guildId: GuildId, userId: UserId, roleId: RoleId): Promise<void> {
      const guild = client?.guilds.cache.get(guildId) as GuildLike | undefined;
      if (!guild) {
        throw new DiscordSendError(
          'unknown',
          'DiscordService.removeMemberRole : guild introuvable',
        );
      }
      let member: GuildMemberLike;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        throw new DiscordSendError(
          'unknown',
          'DiscordService.removeMemberRole : membre introuvable',
        );
      }
      try {
        await member.roles.remove(roleId);
      } catch (err) {
        const reason = classifyError(err);
        throw new DiscordSendError(
          reason,
          `DiscordService.removeMemberRole : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async memberHasRole(guildId: GuildId, userId: UserId, roleId: RoleId): Promise<boolean> {
      const guild = client?.guilds.cache.get(guildId) as GuildLike | undefined;
      if (!guild) return false;
      let member: GuildMemberLike;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        return false;
      }
      return member.roles.cache.has(roleId);
    },

    async postMessage(channelId: ChannelId, content: string): Promise<{ readonly id: MessageId }> {
      const channel = client?.channels.cache.get(channelId);
      if (!channel || !('messages' in channel)) {
        throw new DiscordSendError(
          'channel-not-found',
          'DiscordService.postMessage : salon introuvable',
        );
      }
      const textChannel = channel as TextChannelLike;
      if (!textChannel.send) {
        throw new DiscordSendError(
          'channel-not-found',
          'DiscordService.postMessage : le salon ne supporte pas send()',
        );
      }
      try {
        const message = await textChannel.send(content);
        return { id: message.id as MessageId };
      } catch (err) {
        const reason = classifyError(err);
        throw new DiscordSendError(
          reason,
          `DiscordService.postMessage : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async createRole(
      guildId: GuildId,
      params: {
        readonly name: string;
        readonly mentionable?: boolean;
        readonly hoist?: boolean;
        readonly color?: number;
      },
    ): Promise<{ readonly id: RoleId }> {
      const guild = client?.guilds.cache.get(guildId) as GuildLike | undefined;
      if (!guild) {
        throw new DiscordSendError('unknown', 'DiscordService.createRole : guild introuvable');
      }
      try {
        const role = await guild.roles.create({
          name: params.name,
          mentionable: params.mentionable ?? false,
          hoist: params.hoist ?? false,
          ...(params.color !== undefined ? { colors: { primaryColor: params.color } } : {}),
        });
        return { id: role.id as RoleId };
      } catch (err) {
        const reason = classifyError(err);
        throw new DiscordSendError(
          reason,
          `DiscordService.createRole : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}
