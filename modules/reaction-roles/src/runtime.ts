import type {
  ActionId,
  ChannelId,
  Emoji,
  GuildId,
  GuildMessageReactionAddEvent,
  GuildMessageReactionRemoveEvent,
  MessageId,
  ModuleContext,
  RoleId,
  UserId,
} from '@varde/contracts';

import { type ReactionRoleMessage, type ReactionRolesConfig, resolveConfig } from './config.js';
import { emojiKey, type SelfCausedTracker } from './self-caused.js';

const ACTION_ASSIGNED = 'reaction-roles.role.assigned' as ActionId;
const ACTION_UNASSIGNED = 'reaction-roles.role.unassigned' as ActionId;

/**
 * Recherche la paire (message, pair) correspondant à un event entrant.
 * Retourne null si aucun reaction-role ne matche (event pour un message
 * qui n'est pas géré par nous).
 */
function findPair(
  cfg: ReactionRolesConfig,
  channelId: ChannelId,
  messageId: MessageId,
  emoji: Emoji,
): { readonly message: ReactionRoleMessage; readonly roleId: string } | null {
  for (const msg of cfg.messages) {
    if (msg.channelId !== channelId) continue;
    if (msg.messageId !== messageId) continue;
    for (const pair of msg.pairs) {
      if (emojiKey(emoji) === emojiKey(pair.emoji)) {
        return { message: msg, roleId: pair.roleId };
      }
    }
  }
  return null;
}

async function loadConfig(
  ctx: ModuleContext,
  guildId: GuildId,
): Promise<ReactionRolesConfig | null> {
  try {
    const raw = await ctx.config.get(guildId);
    return resolveConfig(raw);
  } catch (error) {
    ctx.logger.warn('reaction-roles : impossible de résoudre la config', {
      guildId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Handler du `messageReactionAdd`. Applique la règle selon le mode :
 * - normal : assigne le rôle.
 * - verifier : assigne le rôle (remove no-op).
 * - unique : assigne le rôle + retire les autres rôles du set + enlève
 *   les réactions correspondantes (avec tracking self-caused).
 */
export async function handleReactionAdd(
  ctx: ModuleContext,
  event: GuildMessageReactionAddEvent,
  tracker: SelfCausedTracker,
): Promise<void> {
  const cfg = await loadConfig(ctx, event.guildId);
  if (cfg === null) return;
  const match = findPair(cfg, event.channelId, event.messageId, event.emoji);
  if (!match) return;

  const { message, roleId } = match;

  try {
    await ctx.discord.addMemberRole(
      event.guildId as GuildId,
      event.userId as UserId,
      roleId as RoleId,
    );
  } catch (error) {
    ctx.logger.warn('reaction-roles : addMemberRole a échoué', {
      guildId: event.guildId,
      userId: event.userId,
      roleId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  void ctx.audit.log({
    guildId: event.guildId as GuildId,
    action: ACTION_ASSIGNED,
    actor: { type: 'user', id: event.userId as UserId },
    severity: 'info',
    metadata: { messageId: event.messageId, roleId, mode: message.mode },
  });

  if (message.mode === 'unique') {
    // Pour chaque autre paire du même message, si le user a ce rôle,
    // on le retire ET on enlève sa réaction (tracker self-caused).
    for (const otherPair of message.pairs) {
      if (emojiKey(otherPair.emoji) === emojiKey(event.emoji)) continue;

      const hasRole = await ctx.discord.memberHasRole(
        event.guildId as GuildId,
        event.userId as UserId,
        otherPair.roleId as RoleId,
      );
      if (!hasRole) continue;

      try {
        await ctx.discord.removeMemberRole(
          event.guildId as GuildId,
          event.userId as UserId,
          otherPair.roleId as RoleId,
        );
      } catch (error) {
        ctx.logger.warn('reaction-roles : removeMemberRole (unique) a échoué', {
          guildId: event.guildId,
          userId: event.userId,
          roleId: otherPair.roleId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      // Track self-caused AVANT l'appel API.
      tracker.mark(event.userId, event.messageId, emojiKey(otherPair.emoji));
      try {
        await ctx.discord.removeUserReaction(
          event.channelId as ChannelId,
          event.messageId as MessageId,
          event.userId as UserId,
          otherPair.emoji,
        );
      } catch (error) {
        ctx.logger.warn('reaction-roles : removeUserReaction a échoué', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      void ctx.audit.log({
        guildId: event.guildId as GuildId,
        action: ACTION_UNASSIGNED,
        actor: { type: 'module', id: 'reaction-roles' as never },
        severity: 'info',
        metadata: {
          messageId: event.messageId,
          roleId: otherPair.roleId,
          cause: 'unique-swap',
        },
      });
    }
  }
  // modes 'normal' et 'verifier' : rien de plus à faire sur add.
}

/**
 * Handler du `messageReactionRemove`. Mode normal retire le rôle.
 * Modes unique et verifier : no-op (sauf filtrage self-caused).
 */
export async function handleReactionRemove(
  ctx: ModuleContext,
  event: GuildMessageReactionRemoveEvent,
  tracker: SelfCausedTracker,
): Promise<void> {
  if (tracker.isSelfCaused(event.userId, event.messageId, emojiKey(event.emoji))) {
    ctx.logger.debug('reaction-roles : ignore self-caused reaction remove');
    return;
  }

  const cfg = await loadConfig(ctx, event.guildId);
  if (cfg === null) return;
  const match = findPair(cfg, event.channelId, event.messageId, event.emoji);
  if (!match) return;

  if (match.message.mode === 'verifier') return;
  if (match.message.mode === 'unique') return;

  // mode 'normal' : retirer le rôle
  try {
    await ctx.discord.removeMemberRole(
      event.guildId as GuildId,
      event.userId as UserId,
      match.roleId as RoleId,
    );
  } catch (error) {
    ctx.logger.warn('reaction-roles : removeMemberRole (normal) a échoué', {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  void ctx.audit.log({
    guildId: event.guildId as GuildId,
    action: ACTION_UNASSIGNED,
    actor: { type: 'user', id: event.userId as UserId },
    severity: 'info',
    metadata: {
      messageId: event.messageId,
      roleId: match.roleId,
      cause: 'normal',
    },
  });
}
