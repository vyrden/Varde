import type { ModuleCommand } from '@varde/contracts';

import { ACTION_PURGE, ACTION_SLOWMODE, PERM_PURGE, PERM_SLOWMODE } from '../audit-actions.js';
import { formatDiscordError, readNumberOption } from './helpers.js';

/**
 * Commandes ciblant un salon : `/clear` (suppression bulk) et
 * `/slowmode` (rate limit par utilisateur). Pas de check de
 * hiérarchie (pas de cible utilisateur), pas de DM.
 */

const clear: ModuleCommand = {
  name: 'clear',
  description: 'Supprimer en masse les derniers messages du salon courant.',
  defaultPermission: PERM_PURGE,
  options: [
    {
      name: 'count',
      description: 'Nombre de messages à supprimer (1–100, > 14j ignorés)',
      type: 'integer',
      required: true,
      minValue: 1,
      maxValue: 100,
    },
  ],
  handler: async (input, ctx) => {
    const count = readNumberOption(input, 'count');
    if (count === null || count < 1 || count > 100) {
      return ctx.ui.error('Option `count` requise, entre 1 et 100.');
    }

    let deleted = 0;
    try {
      const result = await ctx.discord.bulkDeleteMessages(input.channelId, count);
      deleted = result.deleted;
    } catch (error) {
      return formatDiscordError(ctx, error, 'clear');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_PURGE,
      actor: { type: 'user', id: input.userId },
      target: { type: 'channel', id: input.channelId },
      severity: 'info',
      metadata: { requested: count, deleted },
    });

    const skipped = count - deleted;
    const msg =
      skipped > 0
        ? `${deleted} message${deleted > 1 ? 's' : ''} supprimé${deleted > 1 ? 's' : ''} (${skipped} ignoré${skipped > 1 ? 's' : ''} : > 14j).`
        : `${deleted} message${deleted > 1 ? 's' : ''} supprimé${deleted > 1 ? 's' : ''}.`;
    return ctx.ui.success(msg);
  },
};

const slowmode: ModuleCommand = {
  name: 'slowmode',
  description: 'Configurer le slowmode du salon courant (0 = désactiver).',
  defaultPermission: PERM_SLOWMODE,
  options: [
    {
      name: 'seconds',
      description: 'Délai entre messages, 0–21600 (6h)',
      type: 'integer',
      required: true,
      minValue: 0,
      maxValue: 21_600,
    },
  ],
  handler: async (input, ctx) => {
    const seconds = readNumberOption(input, 'seconds');
    if (seconds === null || seconds < 0 || seconds > 21_600) {
      return ctx.ui.error('Option `seconds` requise, entre 0 et 21600.');
    }

    try {
      await ctx.discord.setChannelSlowmode(input.channelId, seconds);
    } catch (error) {
      return formatDiscordError(ctx, error, 'slowmode');
    }

    await ctx.audit.log({
      guildId: input.guildId,
      action: ACTION_SLOWMODE,
      actor: { type: 'user', id: input.userId },
      target: { type: 'channel', id: input.channelId },
      severity: 'info',
      metadata: { seconds },
    });

    return ctx.ui.success(
      seconds === 0 ? 'Slowmode désactivé.' : `Slowmode réglé sur ${seconds}s entre les messages.`,
    );
  },
};

export const channelOpsCommands: Record<string, ModuleCommand> = {
  clear,
  slowmode,
};

export { clear, slowmode };
