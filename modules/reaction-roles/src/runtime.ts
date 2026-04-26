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

const formatRoleLabel = (ctx: ModuleContext, guildId: GuildId, roleId: RoleId): string =>
  ctx.discord.getRoleName(guildId, roleId) ?? 'un rôle';

const formatGuildLabel = (ctx: ModuleContext, guildId: GuildId): string =>
  ctx.discord.getGuildName(guildId) ?? 'le serveur';

/**
 * Tente d'envoyer un DM de feedback selon la préférence du message
 * (`feedback === 'dm'`). En mode `'none'` la fonction est un no-op.
 * Les échecs (DMs fermés, erreur réseau, etc.) sont avalés : un retour
 * visuel raté ne doit jamais bloquer le fonctionnement métier.
 */
const notifyUser = async (
  ctx: ModuleContext,
  feedback: ReactionRoleMessage['feedback'],
  userId: UserId,
  content: string,
): Promise<void> => {
  if (feedback === 'none') return;
  try {
    await ctx.discord.sendDirectMessage(userId, content);
  } catch (error) {
    ctx.logger.debug('reaction-roles : sendDirectMessage a échoué', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Recherche la paire `kind: 'reaction'` correspondant à un event
 * entrant. Retourne null si aucun reaction-role ne matche (event pour
 * un message qui n'est pas géré par nous, ou paire `kind: 'button'`
 * publiée à part — les clics buttons passent par `buttons.ts`).
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
      if (pair.kind !== 'reaction') continue;
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
  ctx.logger.debug('reaction-roles : reactionAdd reçu', {
    guildId: event.guildId,
    userId: event.userId,
    messageId: event.messageId,
  });
  const cfg = await loadConfig(ctx, event.guildId);
  if (cfg === null) return;
  const match = findPair(cfg, event.channelId, event.messageId, event.emoji);
  if (!match) return;

  const { message, roleId } = match;
  const typedGuildId = event.guildId as GuildId;
  const typedUserId = event.userId as UserId;
  const typedRoleId = roleId as RoleId;

  try {
    await ctx.discord.addMemberRole(typedGuildId, typedUserId, typedRoleId);
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
    guildId: typedGuildId,
    action: ACTION_ASSIGNED,
    actor: { type: 'user', id: typedUserId },
    severity: 'info',
    metadata: { messageId: event.messageId, roleId, mode: message.mode },
  });

  void notifyUser(
    ctx,
    message.feedback,
    typedUserId,
    `✅ Tu as obtenu le rôle **${formatRoleLabel(ctx, typedGuildId, typedRoleId)}** dans **${formatGuildLabel(ctx, typedGuildId)}**.`,
  );

  if (message.mode === 'unique') {
    // Pour chaque autre paire du même message, si le user a ce rôle,
    // on le retire. Pour les paires `kind: 'reaction'`, on enlève aussi
    // la réaction de l'utilisateur (avec tracker self-caused) ; pour
    // les paires `kind: 'button'`, il n'y a rien à nettoyer côté UI.
    for (const otherPair of message.pairs) {
      if (otherPair.roleId === roleId) continue;
      if (otherPair.kind === 'reaction' && emojiKey(otherPair.emoji) === emojiKey(event.emoji)) {
        continue;
      }

      const hasRole = await ctx.discord.memberHasRole(
        typedGuildId,
        typedUserId,
        otherPair.roleId as RoleId,
      );
      if (!hasRole) continue;

      try {
        await ctx.discord.removeMemberRole(typedGuildId, typedUserId, otherPair.roleId as RoleId);
      } catch (error) {
        ctx.logger.warn('reaction-roles : removeMemberRole (unique) a échoué', {
          guildId: event.guildId,
          userId: event.userId,
          roleId: otherPair.roleId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (otherPair.kind === 'reaction') {
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
      }

      void ctx.audit.log({
        guildId: typedGuildId,
        action: ACTION_UNASSIGNED,
        actor: { type: 'module', id: 'reaction-roles' as never },
        severity: 'info',
        metadata: {
          messageId: event.messageId,
          roleId: otherPair.roleId,
          cause: 'unique-swap',
        },
      });

      void notifyUser(
        ctx,
        message.feedback,
        typedUserId,
        `🔄 Le rôle **${formatRoleLabel(ctx, typedGuildId, otherPair.roleId as RoleId)}** t'a été retiré dans **${formatGuildLabel(ctx, typedGuildId)}** (mode unique).`,
      );
    }
  }
  // modes 'normal' et 'verifier' : rien de plus à faire sur add.
}

/**
 * Handler du `messageReactionRemove`. Quel que soit le mode, retirer
 * sa réaction retire le rôle correspondant pour l'utilisateur. Les
 * retraits provoqués par le bot lui-même (swap en mode unique) sont
 * filtrés via le tracker self-caused.
 */
export async function handleReactionRemove(
  ctx: ModuleContext,
  event: GuildMessageReactionRemoveEvent,
  tracker: SelfCausedTracker,
): Promise<void> {
  ctx.logger.debug('reaction-roles : reactionRemove reçu', {
    guildId: event.guildId,
    userId: event.userId,
    messageId: event.messageId,
  });
  if (tracker.isSelfCaused(event.userId, event.messageId, emojiKey(event.emoji))) {
    ctx.logger.debug('reaction-roles : ignore self-caused reaction remove');
    return;
  }

  const cfg = await loadConfig(ctx, event.guildId);
  if (cfg === null) return;
  const match = findPair(cfg, event.channelId, event.messageId, event.emoji);
  if (!match) return;

  const typedGuildId = event.guildId as GuildId;
  const typedUserId = event.userId as UserId;
  const typedRoleId = match.roleId as RoleId;

  try {
    await ctx.discord.removeMemberRole(typedGuildId, typedUserId, typedRoleId);
  } catch (error) {
    ctx.logger.warn('reaction-roles : removeMemberRole a échoué', {
      mode: match.message.mode,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  void ctx.audit.log({
    guildId: typedGuildId,
    action: ACTION_UNASSIGNED,
    actor: { type: 'user', id: typedUserId },
    severity: 'info',
    metadata: {
      messageId: event.messageId,
      roleId: match.roleId,
      cause: match.message.mode,
    },
  });

  void notifyUser(
    ctx,
    match.message.feedback,
    typedUserId,
    `❌ Le rôle **${formatRoleLabel(ctx, typedGuildId, typedRoleId)}** t'a été retiré dans **${formatGuildLabel(ctx, typedGuildId)}**.`,
  );
}
