import type { GuildMemberJoinEvent, GuildMemberLeaveEvent, ModuleContext } from '@varde/contracts';

/**
 * Squelette des handlers welcome. La logique réelle (rendu template,
 * carte d'avatar, kick/quarantaine, auto-rôle différé) arrive en
 * étape 2.
 */
export async function handleMemberJoin(
  ctx: ModuleContext,
  event: GuildMemberJoinEvent,
): Promise<void> {
  ctx.logger.debug('welcome : memberJoin reçu', {
    guildId: event.guildId,
    userId: event.userId,
  });
}

export async function handleMemberLeave(
  ctx: ModuleContext,
  event: GuildMemberLeaveEvent,
): Promise<void> {
  ctx.logger.debug('welcome : memberLeave reçu', {
    guildId: event.guildId,
    userId: event.userId,
  });
}
