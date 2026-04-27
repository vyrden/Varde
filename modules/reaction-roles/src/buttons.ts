import type {
  ButtonInteractionInput,
  ChannelId,
  GuildId,
  MessageId,
  ModuleContext,
  RoleId,
  UIMessage,
  UserId,
} from '@varde/contracts';

import { type ReactionRoleMessage, type ReactionRolesConfig, resolveConfig } from './config.js';

/**
 * Préfixe `customId` réservé au module reaction-roles. Forme stable :
 *
 *   `rr:<entryUuid>:<roleSnowflake>`
 *
 * - `entryUuid` est le `id` UUID de l'entrée `ReactionRoleMessage` ; il
 *   est court et ne dépend ni du salon ni du `messageId` Discord, ce
 *   qui simplifie le matching côté runtime.
 * - `roleSnowflake` est le `roleId` ciblé. Discord limite `customId` à
 *   100 caractères : 3 (`rr:`) + 36 (UUID) + 1 (`:`) + 19 (snowflake)
 *   = 59, on est large.
 *
 * Format stable — un changement casserait les boutons déjà publiés
 * sur Discord.
 */
const CUSTOM_ID_PREFIX = 'rr:';

export const RR_BUTTON_CUSTOM_ID_PREFIX = CUSTOM_ID_PREFIX;

export interface ParsedButtonCustomId {
  readonly entryId: string;
  readonly roleId: string;
}

/**
 * Parse un `customId` `rr:<entryUuid>:<roleSnowflake>`. Retourne
 * `null` si le format ne correspond pas — le handler répondra
 * silencieusement et un avertissement sera loggé pour aider au debug
 * d'un éventuel bouton orphelin.
 */
export function parseButtonCustomId(customId: string): ParsedButtonCustomId | null {
  if (!customId.startsWith(CUSTOM_ID_PREFIX)) return null;
  const rest = customId.slice(CUSTOM_ID_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  return {
    entryId: rest.slice(0, sep),
    roleId: rest.slice(sep + 1),
  };
}

/**
 * Construit le `customId` posé sur un bouton publié pour la paire
 * (entry, roleId). Symétrique de `parseButtonCustomId`.
 */
export function buildButtonCustomId(entryId: string, roleId: string): string {
  return `${CUSTOM_ID_PREFIX}${entryId}:${roleId}`;
}

interface ResolvedEntry {
  readonly entry: ReactionRoleMessage;
  readonly roleId: string;
}

/**
 * Cherche dans la config une paire `kind: 'button'` qui matche le
 * customId parsé. Retourne `null` si l'entrée n'existe plus, si la
 * paire n'est plus listée, ou si elle n'est plus de kind `button`
 * — protège contre les boutons obsolètes encore visibles sur Discord
 * après une suppression / un changement côté dashboard.
 */
function findEntry(cfg: ReactionRolesConfig, parsed: ParsedButtonCustomId): ResolvedEntry | null {
  for (const entry of cfg.messages) {
    if (entry.id !== parsed.entryId) continue;
    const match = entry.pairs.find((p) => p.roleId === parsed.roleId);
    if (!match || match.kind !== 'button') return null;
    return { entry, roleId: parsed.roleId };
  }
  return null;
}

const formatRoleLabel = (ctx: ModuleContext, guildId: GuildId, roleId: RoleId): string =>
  ctx.discord.getRoleName(guildId, roleId) ?? 'un rôle';

const formatGuildLabel = (ctx: ModuleContext, guildId: GuildId): string =>
  ctx.discord.getGuildName(guildId) ?? 'le serveur';

/**
 * Tente d'envoyer un DM de feedback. Les échecs (DMs fermés, erreur
 * réseau) sont avalés — un retour visuel raté ne doit jamais bloquer
 * l'attribution du rôle. Symétrique de l'helper du runtime V1.
 */
const notifyByDm = async (ctx: ModuleContext, userId: UserId, content: string): Promise<void> => {
  try {
    await ctx.discord.sendDirectMessage(userId, content);
  } catch (error) {
    ctx.logger.debug('reaction-roles : sendDirectMessage a échoué', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const ACTION_ASSIGNED = 'reaction-roles.role.assigned';
const ACTION_UNASSIGNED = 'reaction-roles.role.unassigned';

/**
 * Handler appelé par le bot à chaque click sur un bouton dont le
 * `customId` commence par `rr:`. Sémantique :
 *
 * 1. Parse le customId. Format invalide → silencieux (`null`).
 * 2. Recherche l'entrée correspondante dans la config. Introuvable
 *    ou obsolète → silencieux.
 * 3. Toggle le rôle :
 *    - L'utilisateur a déjà le rôle → on lui retire.
 *    - Sinon → on lui ajoute, et en mode `unique` on retire les
 *      autres rôles du set.
 * 4. Audit + feedback selon `entry.feedback` (`dm` / `ephemeral` /
 *    `none`).
 *
 * Le mode `verifier` ne se distingue pas de `normal` côté boutons :
 * sans réaction emoji, il n'y a pas de retrait silencieux à filtrer
 * — toutes les opérations sont des clics utilisateur explicites.
 */
export async function handleButtonClick(
  ctx: ModuleContext,
  input: ButtonInteractionInput,
): Promise<UIMessage | null> {
  const parsed = parseButtonCustomId(input.customId);
  if (!parsed) return null;

  let cfg: ReactionRolesConfig;
  try {
    const raw = await ctx.config.get(input.guildId);
    cfg = resolveConfig(raw);
  } catch (error) {
    ctx.logger.warn('reaction-roles : impossible de résoudre la config (button)', {
      guildId: input.guildId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const match = findEntry(cfg, parsed);
  if (!match) {
    ctx.logger.debug('reaction-roles : bouton orphelin (entrée introuvable)', {
      customId: input.customId,
    });
    return null;
  }

  const guildId = input.guildId;
  const userId = input.userId;
  const roleId = match.roleId as RoleId;
  const entry = match.entry;

  // Toggle : si l'utilisateur a déjà le rôle, on le retire ; sinon on l'ajoute.
  let hasRole = false;
  try {
    hasRole = await ctx.discord.memberHasRole(guildId, userId, roleId);
  } catch (error) {
    ctx.logger.warn('reaction-roles : memberHasRole a échoué (button)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return entry.feedback === 'ephemeral'
      ? ctx.ui.error("Impossible de vérifier ton rôle pour l'instant. Réessaie dans un instant.")
      : null;
  }

  let result: 'added' | 'removed';
  try {
    if (hasRole) {
      await ctx.discord.removeMemberRole(guildId, userId, roleId);
      result = 'removed';
    } else {
      await ctx.discord.addMemberRole(guildId, userId, roleId);
      result = 'added';
    }
  } catch (error) {
    ctx.logger.warn('reaction-roles : toggle rôle a échoué (button)', {
      guildId,
      userId,
      roleId,
      hasRole,
      error: error instanceof Error ? error.message : String(error),
    });
    return entry.feedback === 'ephemeral'
      ? ctx.ui.error(
          'Impossible de modifier ton rôle. Le bot manque peut-être de la permission Manage Roles.',
        )
      : null;
  }

  // Mode unique : retirer les autres rôles du set quand on en ajoute un.
  // Pour les paires `kind: 'reaction'` du même message, on retire aussi
  // la réaction de l'utilisateur — sinon l'UI Discord garde une trace
  // visible (réaction posée) qui ne reflète plus son état réel.
  if (result === 'added' && entry.mode === 'unique') {
    for (const otherPair of entry.pairs) {
      if (otherPair.roleId === roleId) continue;
      const otherRoleId = otherPair.roleId as RoleId;
      let otherHas = false;
      try {
        otherHas = await ctx.discord.memberHasRole(guildId, userId, otherRoleId);
      } catch {
        continue;
      }
      if (!otherHas) continue;
      try {
        await ctx.discord.removeMemberRole(guildId, userId, otherRoleId);
        await ctx.audit.log({
          guildId,
          action: ACTION_UNASSIGNED as never,
          actor: { type: 'module', id: 'reaction-roles' as never },
          severity: 'info',
          metadata: {
            entryId: entry.id,
            roleId: otherPair.roleId,
            cause: 'unique-swap',
          },
        });
      } catch (error) {
        ctx.logger.warn('reaction-roles : removeMemberRole (unique-swap) a échoué (button)', {
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (otherPair.kind === 'reaction') {
        try {
          await ctx.discord.removeUserReaction(
            entry.channelId as ChannelId,
            entry.messageId as MessageId,
            userId,
            otherPair.emoji,
          );
        } catch (error) {
          ctx.logger.debug('reaction-roles : removeUserReaction (unique-swap) a échoué (button)', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  await ctx.audit.log({
    guildId,
    action: (result === 'added' ? ACTION_ASSIGNED : ACTION_UNASSIGNED) as never,
    actor: { type: 'user', id: userId },
    severity: 'info',
    metadata: { entryId: entry.id, roleId, mode: entry.mode, source: 'button' },
  });

  const roleLabel = formatRoleLabel(ctx, guildId, roleId);
  const guildLabel = formatGuildLabel(ctx, guildId);
  const successMessage =
    result === 'added'
      ? `✅ Tu as obtenu le rôle **${roleLabel}** dans **${guildLabel}**.`
      : `❌ Le rôle **${roleLabel}** t'a été retiré dans **${guildLabel}**.`;

  switch (entry.feedback) {
    case 'ephemeral':
      return ctx.ui.success(successMessage);
    case 'dm':
      void notifyByDm(ctx, userId, successMessage);
      return null;
    case 'none':
      return null;
  }
}
