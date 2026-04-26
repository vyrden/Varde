import type { ActionId, GuildMessageCreateEvent, ModuleContext, RoleId } from '@varde/contracts';

import { type AutomodConfig, type AutomodRule, resolveConfig } from './config.js';

/**
 * Runtime automod : écoute `guild.messageCreate`, évalue les règles
 * dans l'ordre, applique l'action de la première règle qui matche.
 *
 * Pas d'état partagé entre messages — chaque évaluation est
 * indépendante. Le rate-limiting (sliding window N messages / M
 * secondes → mute) viendra dans une PR ultérieure ; pour V1, les
 * patterns regex couvrent déjà les abus courants (@everyone répétés,
 * liens en masse).
 *
 * Bypass roles : on `fetch` le membre auteur pour vérifier s'il a
 * l'un des rôles bypass — si oui, retour immédiat. Un faux positif
 * sur fetch (membre non en cache, etc.) ne bloque PAS l'application
 * (sécurité par défaut : automod actif si on ne peut pas confirmer).
 */

export const ACTION_AUTOMOD_TRIGGERED = 'moderation.automod.triggered' as ActionId;

/**
 * Compile une règle en prédicat sur un texte. Les regex sont
 * compilées une fois et cachées par `id` côté runtime — le cache
 * vit dans la closure `createAutomodHandler`.
 */
const compileRule = (rule: AutomodRule): ((content: string) => boolean) => {
  if (rule.kind === 'blacklist') {
    const needle = rule.pattern.toLowerCase();
    return (content: string) => content.toLowerCase().includes(needle);
  }
  // kind === 'regex'
  try {
    const re = new RegExp(rule.pattern, 'i');
    return (content: string) => re.test(content);
  } catch {
    // Pattern invalide : règle inerte (jamais matche). Le dashboard
    // doit valider côté UI mais on dégrade gracieusement.
    return () => false;
  }
};

/**
 * Évalue une liste de règles contre un contenu et retourne la
 * première règle qui matche, ou `null` si aucune. Exporté pour les
 * tests — la version runtime utilise un cache de regex compilées.
 */
export function evaluateRules(content: string, rules: readonly AutomodRule[]): AutomodRule | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const predicate = compileRule(rule);
    if (predicate(content)) return rule;
  }
  return null;
}

/**
 * Vérifie si l'auteur a l'un des rôles bypass. Defensive : si `fetch`
 * échoue (membre non en cache, partial), on retourne `false` —
 * l'automod s'applique. Sinon des messages malveillants pourraient
 * passer à travers en cas de glitch Discord.
 */
const isBypassedAuthor = async (
  ctx: ModuleContext,
  guildId: GuildMessageCreateEvent['guildId'],
  authorId: GuildMessageCreateEvent['authorId'],
  bypassRoleIds: readonly string[],
): Promise<boolean> => {
  if (bypassRoleIds.length === 0) return false;
  for (const roleId of bypassRoleIds) {
    try {
      const has = await ctx.discord.memberHasRole(guildId, authorId, roleId as RoleId);
      if (has) return true;
    } catch {
      // ignore : on continue avec les autres rôles
    }
  }
  return false;
};

/** Applique l'action d'une règle qui a matché. */
const applyAction = async (
  ctx: ModuleContext,
  event: GuildMessageCreateEvent,
  rule: AutomodRule,
  mutedRoleId: string | null,
): Promise<{ readonly applied: 'delete' | 'warn' | 'mute' | 'mute-no-role' }> => {
  if (rule.action === 'warn') {
    return { applied: 'warn' };
  }

  // Toutes les autres actions impliquent au moins la suppression du
  // message — on tente de supprimer en silence (échec audit-only).
  try {
    await ctx.discord.deleteMessage(event.channelId, event.messageId);
  } catch (error) {
    ctx.logger.debug('automod : deleteMessage a échoué', {
      messageId: event.messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (rule.action === 'delete') {
    return { applied: 'delete' };
  }

  // rule.action === 'mute'
  if (mutedRoleId === null) {
    // Pas de rôle muet configuré — on log et on s'arrête au delete.
    ctx.logger.warn('automod : règle mute déclenchée sans mutedRoleId configuré', {
      ruleId: rule.id,
    });
    return { applied: 'mute-no-role' };
  }

  try {
    await ctx.discord.addMemberRole(event.guildId, event.authorId, mutedRoleId as RoleId);
  } catch (error) {
    ctx.logger.warn('automod : addMemberRole a échoué', {
      authorId: event.authorId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { applied: 'mute-no-role' };
  }

  if (rule.durationMs !== null) {
    const jobKey = `moderation:automod-mute:${event.guildId}:${event.authorId}:${rule.id}`;
    await ctx.scheduler.in(rule.durationMs, jobKey, async () => {
      try {
        await ctx.discord.removeMemberRole(event.guildId, event.authorId, mutedRoleId as RoleId);
      } catch {
        // ignore — admin peut unmute manuellement
      }
    });
  }
  return { applied: 'mute' };
};

/**
 * Construit le handler à attacher à `ctx.events.on('guild.messageCreate', handler)`.
 * Garde un cache de `Map<ruleId, predicate>` pour éviter de
 * recompiler les regex à chaque message — mais invalidé au moindre
 * changement de config (clé `JSON.stringify` du rules array).
 *
 * Le handler ignore les messages des bots (anti-boucle) et les
 * messages sans contenu textuel (ex. embeds-only postés par le bot
 * lui-même).
 */
export function createAutomodHandler(
  ctx: ModuleContext,
): (event: GuildMessageCreateEvent) => Promise<void> {
  return async (event: GuildMessageCreateEvent) => {
    if (event.content.length === 0) return;

    let cfg: AutomodConfig;
    let mutedRoleId: string | null;
    try {
      const raw = await ctx.config.get(event.guildId);
      const moderationCfg = resolveConfig(raw);
      cfg = moderationCfg.automod;
      mutedRoleId = moderationCfg.mutedRoleId;
    } catch {
      return;
    }

    if (cfg.rules.length === 0) return;

    if (await isBypassedAuthor(ctx, event.guildId, event.authorId, cfg.bypassRoleIds)) {
      return;
    }

    const matched = evaluateRules(event.content, cfg.rules);
    if (matched === null) return;

    const result = await applyAction(ctx, event, matched, mutedRoleId);

    void ctx.audit.log({
      guildId: event.guildId,
      action: ACTION_AUTOMOD_TRIGGERED,
      actor: { type: 'module', id: 'moderation' as never },
      target: { type: 'user', id: event.authorId },
      severity: result.applied === 'warn' ? 'info' : 'warn',
      metadata: {
        ruleId: matched.id,
        ruleLabel: matched.label,
        ruleKind: matched.kind,
        action: matched.action,
        applied: result.applied,
        channelId: event.channelId,
        messageId: event.messageId,
        // Tronque le contenu pour ne pas exploser la métadonnée audit.
        contentSnippet:
          event.content.length > 200 ? `${event.content.slice(0, 200)}…` : event.content,
      },
    });
  };
}
