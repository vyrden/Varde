import type {
  ActionId,
  AIService,
  GuildMessageCreateEvent,
  ModuleContext,
  RoleId,
} from '@varde/contracts';

import {
  type AutomodAiCategory,
  type AutomodAiClassifyRule,
  type AutomodBlacklistRule,
  type AutomodConfig,
  type AutomodRateLimitRule,
  type AutomodRegexRule,
  type AutomodRule,
  resolveConfig,
} from './config.js';

/**
 * Runtime automod : écoute `guild.messageCreate`, évalue les règles
 * dans l'ordre, applique l'action de la première règle qui matche.
 *
 * Quatre kinds supportés (cf. `config.ts`) :
 * - `blacklist` / `regex` : matchs textuels synchrones, gratuits.
 * - `rate-limit`           : sliding window par couple (auteur, scope).
 *                            État maintenu en mémoire dans la closure
 *                            du handler.
 * - `ai-classify`          : délègue au `ctx.ai.classify` ; appel
 *                            retardé pour ne payer le coût IA que si
 *                            aucune règle synchrone n'a matché.
 *
 * Bypass roles : on `fetch` le membre auteur pour vérifier s'il a
 * l'un des rôles bypass — si oui, retour immédiat. Un faux positif
 * sur fetch (membre non en cache, etc.) ne bloque PAS l'application
 * (sécurité par défaut : automod actif si on ne peut pas confirmer).
 */

export const ACTION_AUTOMOD_TRIGGERED = 'moderation.automod.triggered' as ActionId;

const compileBlacklist = (rule: AutomodBlacklistRule): ((content: string) => boolean) => {
  const needle = rule.pattern.toLowerCase();
  return (content) => content.toLowerCase().includes(needle);
};

const compileRegex = (rule: AutomodRegexRule): ((content: string) => boolean) => {
  try {
    const re = new RegExp(rule.pattern, 'i');
    return (content) => re.test(content);
  } catch {
    return () => false;
  }
};

/**
 * Tracker de rate-limit en mémoire. Indexé par clé scopée
 * `${ruleId}:${guildId}:${userId}[:${channelId}]` ; chaque entrée est
 * un tableau de timestamps (ms epoch) tronqué à la fenêtre courante.
 *
 * Exposé pour permettre aux tests d'injecter une horloge fake et
 * d'observer l'évolution du compteur.
 */
export interface RateLimitTracker {
  /** Enregistre un message et retourne `true` si la règle déclenche. */
  readonly hit: (rule: AutomodRateLimitRule, key: string, nowMs: number) => boolean;
  /** Vide complètement le tracker (utilisé par les tests). */
  readonly clear: () => void;
}

export function createRateLimitTracker(): RateLimitTracker {
  const buckets = new Map<string, number[]>();
  return {
    hit(rule, key, nowMs) {
      const cutoff = nowMs - rule.windowMs;
      const stamps = buckets.get(key) ?? [];
      // Purge des timestamps hors fenêtre. Tableau ordonné par construction.
      while (stamps.length > 0 && (stamps[0] as number) <= cutoff) {
        stamps.shift();
      }
      stamps.push(nowMs);
      buckets.set(key, stamps);
      return stamps.length > rule.count;
    },
    clear() {
      buckets.clear();
    },
  };
}

const rateLimitKey = (rule: AutomodRateLimitRule, event: GuildMessageCreateEvent): string => {
  const tail = rule.scope === 'user-channel' ? `:${event.channelId}` : '';
  return `${rule.id}:${event.guildId}:${event.authorId}${tail}`;
};

/**
 * Demande au classifier IA si le message tombe dans une des catégories
 * surveillées. Retourne la catégorie matchée ou `null`. Le label
 * `'safe'` est ajouté au pool envoyé à l'IA pour permettre une voie
 * de sortie ; toute réponse hors-pool est traitée comme `'safe'`
 * (fail-open).
 */
async function classifyAgainst(
  ai: AIService,
  rule: AutomodAiClassifyRule,
  content: string,
): Promise<AutomodAiCategory | null> {
  const trimmed =
    content.length > rule.maxContentLength ? content.slice(0, rule.maxContentLength) : content;
  const labels = ['safe', ...rule.categories];
  let result: string;
  try {
    result = await ai.classify(trimmed, labels);
  } catch {
    return null;
  }
  const normalized = result.trim().toLowerCase();
  if (normalized === 'safe') return null;
  return (rule.categories as ReadonlyArray<string>).includes(normalized)
    ? (normalized as AutomodAiCategory)
    : null;
}

/**
 * Résultat d'évaluation d'un message contre les règles d'une config.
 * `null` si rien ne matche, sinon la règle gagnante avec le détail
 * spécifique au kind (catégorie IA, compteur rate-limit).
 */
type EvalMatch =
  | { readonly kind: 'blacklist' | 'regex' | 'rate-limit'; readonly rule: AutomodRule }
  | {
      readonly kind: 'ai-classify';
      readonly rule: AutomodAiClassifyRule;
      readonly category: AutomodAiCategory;
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

export interface CreateAutomodHandlerOptions {
  /** Horloge injectable (tests). Défaut : `Date.now`. */
  readonly now?: () => number;
}

/**
 * Construit le handler à attacher à `ctx.events.on('guild.messageCreate', handler)`.
 *
 * État interne : un `RateLimitTracker` partagé pour toutes les règles
 * `kind: 'rate-limit'` de toutes les guilds — clé scopée par
 * `(ruleId, guildId, userId)` (et channelId optionnel) donc pas de
 * collisions inter-guilds.
 *
 * Le handler ignore les messages des bots (anti-boucle) et les
 * messages sans contenu textuel (ex. embeds-only postés par le bot
 * lui-même).
 */
export function createAutomodHandler(
  ctx: ModuleContext,
  options: CreateAutomodHandlerOptions = {},
): (event: GuildMessageCreateEvent) => Promise<void> {
  const now = options.now ?? (() => Date.now());
  const rateLimit = createRateLimitTracker();

  return async (event: GuildMessageCreateEvent) => {
    let cfg: AutomodConfig;
    let mutedRoleId: string | null;
    try {
      const raw = await ctx.config.get(event.guildId);
      const moderationCfg = resolveConfig(raw);
      cfg = moderationCfg.automod;
      mutedRoleId = moderationCfg.mutedRoleId;
    } catch (error) {
      ctx.logger.debug('automod : config indisponible, skip', {
        guildId: event.guildId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (cfg.rules.length === 0) return;

    // Les règles textuelles (blacklist / regex / IA) ne peuvent rien
    // matcher sur un message vide. Les règles `rate-limit`, elles,
    // comptent même les messages embed-only — on garde l'évaluation
    // active dans ce cas.
    const hasOnlyTextualRules = cfg.rules.every(
      (r) => r.kind === 'blacklist' || r.kind === 'regex' || r.kind === 'ai-classify',
    );
    if (event.content.length === 0 && hasOnlyTextualRules) return;

    if (await isBypassedAuthor(ctx, event.guildId, event.authorId, cfg.bypassRoleIds)) {
      return;
    }

    const matched = await evaluateRulesAgainst(cfg.rules, {
      content: event.content,
      event,
      nowMs: now(),
      rateLimit,
      ai: ctx.ai,
    });
    if (matched === null) return;

    ctx.logger.info('automod : règle déclenchée', {
      guildId: event.guildId,
      authorId: event.authorId,
      ruleId: matched.rule.id,
      ruleKind: matched.rule.kind,
      action: matched.rule.action,
      ...(matched.kind === 'ai-classify' ? { aiCategory: matched.category } : {}),
    });

    const result = await applyAction(ctx, event, matched.rule, mutedRoleId);

    void ctx.audit.log({
      guildId: event.guildId,
      action: ACTION_AUTOMOD_TRIGGERED,
      actor: { type: 'module', id: 'moderation' as never },
      target: { type: 'user', id: event.authorId },
      severity: result.applied === 'warn' ? 'info' : 'warn',
      metadata: {
        ruleId: matched.rule.id,
        ruleLabel: matched.rule.label,
        ruleKind: matched.rule.kind,
        action: matched.rule.action,
        applied: result.applied,
        channelId: event.channelId,
        messageId: event.messageId,
        ...(matched.kind === 'ai-classify' ? { aiCategory: matched.category } : {}),
        // Tronque le contenu pour ne pas exploser la métadonnée audit.
        contentSnippet:
          event.content.length > 200 ? `${event.content.slice(0, 200)}…` : event.content,
      },
    });
  };
}

export interface EvaluateRulesContext {
  readonly content: string;
  readonly event: GuildMessageCreateEvent;
  readonly nowMs: number;
  readonly rateLimit: RateLimitTracker;
  readonly ai: AIService | null;
}

/**
 * Évalue les règles dans l'ordre, deux passes :
 *
 * 1. Règles synchrones (`blacklist`, `regex`, `rate-limit`) — gratuites.
 * 2. Classification IA (`ai-classify`) — un seul appel `ctx.ai.classify`
 *    par message, dirigé sur la première règle IA active.
 *
 * On ne paye le coût IA que si aucune règle synchrone n'a matché ET
 * qu'au moins une règle `ai-classify` est active. Si `ctx.ai === null`
 * les règles IA sont silencieusement ignorées (audit-only côté
 * runtime).
 */
export async function evaluateRulesAgainst(
  rules: readonly AutomodRule[],
  ctx: EvaluateRulesContext,
): Promise<EvalMatch | null> {
  // Pass 1 : règles synchrones.
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.kind === 'blacklist') {
      if (compileBlacklist(rule)(ctx.content)) return { kind: 'blacklist', rule };
      continue;
    }
    if (rule.kind === 'regex') {
      if (compileRegex(rule)(ctx.content)) return { kind: 'regex', rule };
      continue;
    }
    if (rule.kind === 'rate-limit') {
      if (ctx.rateLimit.hit(rule, rateLimitKey(rule, ctx.event), ctx.nowMs)) {
        return { kind: 'rate-limit', rule };
      }
    }
  }

  // Pass 2 : classification IA — un seul appel par message, dirigé
  // sur la première règle IA active.
  if (ctx.ai === null) return null;
  for (const rule of rules) {
    if (!rule.enabled || rule.kind !== 'ai-classify') continue;
    const category = await classifyAgainst(ctx.ai, rule, ctx.content);
    if (category !== null) {
      return { kind: 'ai-classify', rule, category };
    }
  }
  return null;
}
