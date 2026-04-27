import type { ModuleContext, UserId } from '@varde/contracts';

/**
 * Tentative best-effort d'envoi d'un DM à la cible d'une sanction.
 * `dmOnSanction` côté config gouverne l'activation. Échec silencieux
 * (DMs fermés, bot bloqué) — la sanction est appliquée quoi qu'il
 * arrive, le DM est juste une courtoisie.
 *
 * Le contenu est uniformisé en français côté V1. Future-proof :
 * pourra puiser dans `ctx.i18n.t` quand le module aura ses locales.
 */
export interface SanctionDmInput {
  readonly action: 'warn' | 'kick' | 'ban' | 'tempban' | 'mute' | 'tempmute' | 'unmute' | 'unban';
  readonly guildName: string;
  readonly reason: string | null;
  readonly durationFormatted?: string;
}

const ACTION_LABEL: Record<SanctionDmInput['action'], string> = {
  warn: 'avertissement',
  kick: 'expulsion',
  ban: 'bannissement',
  tempban: 'bannissement temporaire',
  mute: 'mute',
  tempmute: 'mute temporaire',
  unmute: 'levée de mute',
  unban: 'levée de bannissement',
};

export async function sendSanctionDm(
  ctx: ModuleContext,
  userId: UserId,
  input: SanctionDmInput,
): Promise<void> {
  const label = ACTION_LABEL[input.action];
  const lines = [`Tu as reçu un(e) **${label}** sur **${input.guildName}**.`];
  if (input.durationFormatted !== undefined) {
    lines.push(`Durée : ${input.durationFormatted}.`);
  }
  if (input.reason !== null && input.reason.length > 0) {
    lines.push(`Raison : ${input.reason}`);
  }
  const content = lines.join('\n');
  try {
    await ctx.discord.sendDirectMessage(userId, content);
  } catch (error) {
    ctx.logger.debug('moderation : DM sanction échoué (DMs fermés ou bloqué)', {
      userId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
