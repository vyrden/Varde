import type { GuildId, ModuleCommand, ModuleContext, RoleId } from '@varde/contracts';

import {
  ACTION_BAN,
  ACTION_KICK,
  ACTION_MUTE,
  ACTION_TEMPBAN,
  ACTION_TEMPMUTE,
  ACTION_UNBAN,
  ACTION_UNMUTE,
  ACTION_WARN,
  PERM_BAN,
  PERM_KICK,
  PERM_MUTE,
  PERM_WARN,
} from '../audit-actions.js';
import { sendSanctionDm } from '../dm.js';
import { formatDuration, parseDuration } from '../duration.js';
import {
  enforceHierarchy,
  formatDiscordError,
  getMutedRoleId,
  readStringOption,
  readUserIdOption,
  shouldDmOnSanction,
} from './helpers.js';

/**
 * 8 commandes manuelles de sanction ciblant un utilisateur :
 * `/warn /kick /ban /tempban /unban /mute /tempmute /unmute`.
 *
 * Pattern commun :
 * 1. Lire l'option `member` (ou `user` pour `/unban`).
 * 2. Vérifier la hiérarchie via `ctx.discord.canModerate`. Pour
 *    `/unban`, le check est plus permissif (cible déjà bannie, donc
 *    pas dans la guild — `canModerate` retourne `ok: true`).
 * 3. Best-effort : DM la cible si `dmOnSanction` (avant l'action,
 *    pour qu'elle soit reçue avant un kick/ban).
 * 4. Effectuer la mutation Discord (`kickMember`, `banMember`, etc.).
 * 5. Pour `/tempban` et `/tempmute` : planifier la levée via
 *    `ctx.scheduler.in`.
 * 6. Écrire l'entrée audit `moderation.case.<action>` avec
 *    `actor: { type: 'user', id: input.userId }`.
 * 7. Renvoyer un `ctx.ui.success` confirmant l'action.
 *
 * Aucun handler ne court-circuite l'audit log : c'est la source de
 * vérité de l'historique des sanctions (cf. décision PR 4.M.1).
 */

const guildOf = (ctx: ModuleContext, guildId: GuildId): string =>
  ctx.discord.getGuildName(guildId) ?? guildId;

// ---------------------------------------------------------------------------
// /warn
// ---------------------------------------------------------------------------

const warn: ModuleCommand = {
  name: 'warn',
  description: 'Avertir un membre.',
  defaultPermission: PERM_WARN,
  options: [
    { name: 'member', description: 'Membre à avertir', type: 'user', required: true },
    { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
  ],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');
    const reason = readStringOption(input, 'reason');

    const denial = await enforceHierarchy(ctx, input.guildId, input.userId, target);
    if (denial !== null) return denial;

    if (await shouldDmOnSanction(ctx, input.guildId)) {
      await sendSanctionDm(ctx, target, {
        action: 'warn',
        guildName: guildOf(ctx, input.guildId),
        reason,
      });
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_WARN,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'info',
      metadata: { reason: reason ?? null },
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(`Avertissement émis à **${tag}**${reason ? ` : ${reason}` : ''}.`);
  },
};

// ---------------------------------------------------------------------------
// /kick
// ---------------------------------------------------------------------------

const kick: ModuleCommand = {
  name: 'kick',
  description: 'Expulser un membre.',
  defaultPermission: PERM_KICK,
  options: [
    { name: 'member', description: 'Membre à expulser', type: 'user', required: true },
    { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
  ],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');
    const reason = readStringOption(input, 'reason');

    const denial = await enforceHierarchy(ctx, input.guildId, input.userId, target);
    if (denial !== null) return denial;

    if (await shouldDmOnSanction(ctx, input.guildId)) {
      await sendSanctionDm(ctx, target, {
        action: 'kick',
        guildName: guildOf(ctx, input.guildId),
        reason,
      });
    }

    try {
      await ctx.discord.kickMember(input.guildId, target, reason ?? undefined);
    } catch (error) {
      return formatDiscordError(ctx, error, 'kick');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_KICK,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'warn',
      metadata: { reason: reason ?? null },
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(`**${tag}** a été expulsé(e)${reason ? ` : ${reason}` : ''}.`);
  },
};

// ---------------------------------------------------------------------------
// /ban
// ---------------------------------------------------------------------------

const ban: ModuleCommand = {
  name: 'ban',
  description: 'Bannir un membre.',
  defaultPermission: PERM_BAN,
  options: [
    { name: 'member', description: 'Membre à bannir', type: 'user', required: true },
    { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
    {
      name: 'delete-days',
      description: 'Jours de messages à supprimer (0–7)',
      type: 'integer',
      minValue: 0,
      maxValue: 7,
    },
  ],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');
    const reason = readStringOption(input, 'reason');
    const deleteDays =
      typeof input.options['delete-days'] === 'number' ? input.options['delete-days'] : undefined;

    const denial = await enforceHierarchy(ctx, input.guildId, input.userId, target);
    if (denial !== null) return denial;

    if (await shouldDmOnSanction(ctx, input.guildId)) {
      await sendSanctionDm(ctx, target, {
        action: 'ban',
        guildName: guildOf(ctx, input.guildId),
        reason,
      });
    }

    try {
      await ctx.discord.banMember(input.guildId, target, reason ?? undefined, deleteDays);
    } catch (error) {
      return formatDiscordError(ctx, error, 'ban');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_BAN,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'warn',
      metadata: { reason: reason ?? null, deleteMessageDays: deleteDays ?? null },
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(`**${tag}** a été banni(e)${reason ? ` : ${reason}` : ''}.`);
  },
};

// ---------------------------------------------------------------------------
// /tempban
// ---------------------------------------------------------------------------

const tempban: ModuleCommand = {
  name: 'tempban',
  description: 'Bannir temporairement un membre.',
  defaultPermission: PERM_BAN,
  options: [
    { name: 'member', description: 'Membre à bannir', type: 'user', required: true },
    {
      name: 'duration',
      description: 'Durée (ex: 1h, 7d, 1d12h)',
      type: 'string',
      required: true,
      maxLength: 32,
    },
    { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
  ],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');
    const durationRaw = readStringOption(input, 'duration');
    if (durationRaw === null) return ctx.ui.error('Option `duration` requise.');
    const durationMs = parseDuration(durationRaw);
    if (durationMs === null || durationMs <= 0) {
      return ctx.ui.error(
        `Durée \`${durationRaw}\` invalide. Format attendu : \`30s\`, \`1h\`, \`7d\`.`,
      );
    }
    const reason = readStringOption(input, 'reason');
    const formatted = formatDuration(durationMs);

    const denial = await enforceHierarchy(ctx, input.guildId, input.userId, target);
    if (denial !== null) return denial;

    if (await shouldDmOnSanction(ctx, input.guildId)) {
      await sendSanctionDm(ctx, target, {
        action: 'tempban',
        guildName: guildOf(ctx, input.guildId),
        reason,
        durationFormatted: formatted,
      });
    }

    try {
      await ctx.discord.banMember(input.guildId, target, reason ?? undefined);
    } catch (error) {
      return formatDiscordError(ctx, error, 'tempban');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_TEMPBAN,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'warn',
      metadata: { reason: reason ?? null, durationMs, durationFormatted: formatted },
    });

    // Programme la levée du bannissement.
    const jobKey = `moderation:tempban:${input.guildId}:${target}`;
    await ctx.scheduler.in(durationMs, jobKey, async () => {
      try {
        await ctx.discord.unbanMember(input.guildId, target, 'Tempban arrivé à expiration');
      } catch (error) {
        ctx.logger.warn('moderation : unban auto a échoué', {
          guildId: input.guildId,
          userId: target,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      await ctx.audit.log({
        guildId: input.guildId,
        action: ACTION_UNBAN,
        actor: { type: 'module', id: 'moderation' as never },
        target: { type: 'user', id: target },
        severity: 'info',
        metadata: { source: 'tempban-expire' },
      });
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(
      `**${tag}** a été banni(e) pour ${formatted}${reason ? ` : ${reason}` : ''}.`,
    );
  },
};

// ---------------------------------------------------------------------------
// /unban
// ---------------------------------------------------------------------------

const unban: ModuleCommand = {
  name: 'unban',
  description: 'Lever le bannissement d’un utilisateur.',
  defaultPermission: PERM_BAN,
  options: [
    { name: 'user', description: 'Utilisateur à débannir', type: 'user', required: true },
    { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
  ],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'user');
    if (target === null) return ctx.ui.error('Option `user` requise.');
    const reason = readStringOption(input, 'reason');

    // Pas de hiérarchie à vérifier : la cible n'est pas dans la
    // guild (puisqu'elle est bannie). canModerate retournerait `ok`.

    try {
      await ctx.discord.unbanMember(input.guildId, target, reason ?? undefined);
    } catch (error) {
      return formatDiscordError(ctx, error, 'unban');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_UNBAN,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'info',
      metadata: { reason: reason ?? null },
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(`**${tag}** a été débanni(e)${reason ? ` : ${reason}` : ''}.`);
  },
};

// ---------------------------------------------------------------------------
// /mute, /tempmute, /unmute (rôle muet)
// ---------------------------------------------------------------------------

const mute: ModuleCommand = {
  name: 'mute',
  description: 'Mettre un membre en sourdine via le rôle muet configuré.',
  defaultPermission: PERM_MUTE,
  options: [
    { name: 'member', description: 'Membre à muter', type: 'user', required: true },
    { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
  ],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');
    const reason = readStringOption(input, 'reason');

    const mutedRoleId = await getMutedRoleId(ctx, input.guildId);
    if (mutedRoleId === null) {
      return ctx.ui.error(
        "Aucun rôle muet n'est configuré. Configurer `mutedRoleId` dans la page modération du dashboard.",
      );
    }

    const denial = await enforceHierarchy(ctx, input.guildId, input.userId, target);
    if (denial !== null) return denial;

    if (await shouldDmOnSanction(ctx, input.guildId)) {
      await sendSanctionDm(ctx, target, {
        action: 'mute',
        guildName: guildOf(ctx, input.guildId),
        reason,
      });
    }

    try {
      await ctx.discord.addMemberRole(input.guildId, target, mutedRoleId as RoleId);
    } catch (error) {
      return formatDiscordError(ctx, error, 'mute');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_MUTE,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'info',
      metadata: { reason: reason ?? null, roleId: mutedRoleId },
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(`**${tag}** est désormais en sourdine${reason ? ` : ${reason}` : ''}.`);
  },
};

const tempmute: ModuleCommand = {
  name: 'tempmute',
  description: 'Mettre un membre en sourdine pour une durée limitée.',
  defaultPermission: PERM_MUTE,
  options: [
    { name: 'member', description: 'Membre à muter', type: 'user', required: true },
    {
      name: 'duration',
      description: 'Durée (ex: 10m, 1h, 1d)',
      type: 'string',
      required: true,
      maxLength: 32,
    },
    { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
  ],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');
    const durationRaw = readStringOption(input, 'duration');
    if (durationRaw === null) return ctx.ui.error('Option `duration` requise.');
    const durationMs = parseDuration(durationRaw);
    if (durationMs === null || durationMs <= 0) {
      return ctx.ui.error(
        `Durée \`${durationRaw}\` invalide. Format attendu : \`10m\`, \`1h\`, \`1d\`.`,
      );
    }
    const reason = readStringOption(input, 'reason');
    const formatted = formatDuration(durationMs);

    const mutedRoleId = await getMutedRoleId(ctx, input.guildId);
    if (mutedRoleId === null) {
      return ctx.ui.error(
        "Aucun rôle muet n'est configuré. Configurer `mutedRoleId` dans la page modération du dashboard.",
      );
    }

    const denial = await enforceHierarchy(ctx, input.guildId, input.userId, target);
    if (denial !== null) return denial;

    if (await shouldDmOnSanction(ctx, input.guildId)) {
      await sendSanctionDm(ctx, target, {
        action: 'tempmute',
        guildName: guildOf(ctx, input.guildId),
        reason,
        durationFormatted: formatted,
      });
    }

    try {
      await ctx.discord.addMemberRole(input.guildId, target, mutedRoleId as RoleId);
    } catch (error) {
      return formatDiscordError(ctx, error, 'tempmute');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_TEMPMUTE,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'info',
      metadata: {
        reason: reason ?? null,
        durationMs,
        durationFormatted: formatted,
        roleId: mutedRoleId,
      },
    });

    const jobKey = `moderation:tempmute:${input.guildId}:${target}`;
    await ctx.scheduler.in(durationMs, jobKey, async () => {
      try {
        await ctx.discord.removeMemberRole(input.guildId, target, mutedRoleId as RoleId);
      } catch (error) {
        ctx.logger.warn('moderation : unmute auto a échoué', {
          guildId: input.guildId,
          userId: target,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      await ctx.audit.log({
        guildId: input.guildId,
        action: ACTION_UNMUTE,
        actor: { type: 'module', id: 'moderation' as never },
        target: { type: 'user', id: target },
        severity: 'info',
        metadata: { source: 'tempmute-expire' },
      });
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(
      `**${tag}** est en sourdine pour ${formatted}${reason ? ` : ${reason}` : ''}.`,
    );
  },
};

const unmute: ModuleCommand = {
  name: 'unmute',
  description: 'Retirer la sourdine d’un membre.',
  defaultPermission: PERM_MUTE,
  options: [{ name: 'member', description: 'Membre à démuter', type: 'user', required: true }],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');

    const mutedRoleId = await getMutedRoleId(ctx, input.guildId);
    if (mutedRoleId === null) {
      return ctx.ui.error(
        "Aucun rôle muet n'est configuré. Configurer `mutedRoleId` dans la page modération du dashboard.",
      );
    }

    try {
      await ctx.discord.removeMemberRole(input.guildId, target, mutedRoleId as RoleId);
    } catch (error) {
      return formatDiscordError(ctx, error, 'unmute');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_UNMUTE,
      actor: { type: 'user', id: input.userId },
      target: { type: 'user', id: target },
      severity: 'info',
      metadata: { roleId: mutedRoleId },
    });

    const tag = input.resolved.users[target]?.tag ?? target;
    return ctx.ui.success(`**${tag}** n'est plus en sourdine.`);
  },
};

export const sanctionCommands: Record<string, ModuleCommand> = {
  warn,
  kick,
  ban,
  tempban,
  unban,
  mute,
  tempmute,
  unmute,
};

export { ban, kick, mute, tempban, tempmute, unban, unmute, warn };
