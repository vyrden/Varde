import type {
  ActionId,
  AIService,
  GuildMessageCreateEvent,
  ModuleContext,
  RoleId,
  UserId,
} from '@varde/contracts';

import {
  type AutomodAiCategory,
  type AutomodAiClassifyRule,
  type AutomodBlacklistRule,
  type AutomodCapsRule,
  type AutomodConfig,
  type AutomodEmojisRule,
  type AutomodInvitesRule,
  type AutomodKeywordListRule,
  type AutomodLinksRule,
  type AutomodMentionsRule,
  type AutomodRateLimitRule,
  type AutomodRegexRule,
  type AutomodRule,
  type AutomodSpoilersRule,
  type AutomodZalgoRule,
  type ModerationConfig,
  type RestrictedChannel,
  resolveConfig,
} from './config.js';
import { sendSanctionDm } from './dm.js';
import { vocabularyFor } from './keyword-vocab.js';

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

// ─── Détecteurs synchrones (pass 1) ─────────────────────────────────

/**
 * Normalise un texte pour comparaison fuzzy : lowercase, NFD normalize
 * + suppression des marques diacritiques. Utilisé par `keyword-list`
 * et la détection d'invites/links pour neutraliser les variantes
 * d'orthographe ascii vs accentuée.
 *
 * `\p{M}` matche toute Unicode Mark (combining diacritic, enclosing,
 * spacing) — tolère plus large que la classe ASCII U+0300..U+036F.
 */
const normalizeForMatch = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Regex multi-couvertures pour les invites Discord. Couvre :
 * - `discord.gg/<code>` (le plus courant)
 * - `discord.com/invite/<code>` et `discordapp.com/invite/<code>`
 * - Variantes `https?://` ou raccourci direct
 *
 * `<code>` : alphanum + tiret (les codes générés par Discord respectent
 * cette charset). Pas de borne stricte sur la longueur — Discord
 * accepte 6-12 caractères, on tolère plus large.
 */
const INVITE_REGEX =
  /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;

const detectInvites = (_rule: AutomodInvitesRule): ((content: string) => boolean) => {
  // `_rule.allowOwnGuild` réservé pour une future résolution d'invite
  // côté API Discord (V1 implémentation simple — match brut).
  return (content) => INVITE_REGEX.test(content);
};

const URL_REGEX = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/?#][^\s]*)?/gi;

/**
 * Vrai si `host` correspond exactement ou en sous-domaine à un domaine
 * de la whitelist. Comparaison case-insensitive, suppression du
 * trailing dot, tolère les `www.`.
 */
const hostMatchesWhitelist = (host: string, whitelist: ReadonlyArray<string>): boolean => {
  const normalized = host
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  for (const raw of whitelist) {
    const wl = raw
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '');
    if (wl.length === 0) continue;
    if (normalized === wl) return true;
    if (normalized.endsWith(`.${wl}`)) return true;
  }
  return false;
};

const detectLinks = (rule: AutomodLinksRule): ((content: string) => boolean) => {
  return (content) => {
    URL_REGEX.lastIndex = 0;
    const matches = content.matchAll(URL_REGEX);
    for (const m of matches) {
      const host = m[1] ?? '';
      if (host.length === 0) continue;
      if (rule.mode === 'block-all') return true;
      if (!hostMatchesWhitelist(host, rule.whitelist)) return true;
    }
    return false;
  };
};

const detectCaps = (rule: AutomodCapsRule): ((content: string) => boolean) => {
  return (content) => {
    if (content.length < rule.minLength) return false;
    let upper = 0;
    let total = 0;
    for (const ch of content) {
      // Lettres uniquement — chiffres et ponctuation ne comptent pas.
      const isLetter = /\p{L}/u.test(ch);
      if (!isLetter) continue;
      total += 1;
      if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper += 1;
    }
    if (total < rule.minLength) return false;
    return upper / total >= rule.ratio;
  };
};

/**
 * Compte les emojis dans un message :
 * - Custom Discord : `<:name:id>` ou `<a:name:id>`.
 * - Unicode : pictographiques (`\p{Extended_Pictographic}`).
 *
 * On ignore les Variation Selectors (U+FE0F) et les modifiers de teint
 * pour ne pas double-compter un emoji composé (ex. 👨‍👩‍👧 = 1 emoji,
 * pas 3).
 */
const CUSTOM_EMOJI_REGEX = /<a?:[a-z0-9_]+:\d+>/gi;
const PICTO_REGEX = /\p{Extended_Pictographic}/gu;

const detectEmojis = (rule: AutomodEmojisRule): ((content: string) => boolean) => {
  return (content) => {
    const customs = (content.match(CUSTOM_EMOJI_REGEX) ?? []).length;
    // Pour Unicode : matchAll + filtre pour ne pas compter chaque ZWJ-joined
    // séparément. On compte chaque pictographic, ce qui sur-évalue les
    // séquences ZWJ — c'est OK pour un seuil anti-spam, faux positif
    // tolérable.
    const unicode = (content.match(PICTO_REGEX) ?? []).length;
    return customs + unicode > rule.maxCount;
  };
};

const SPOILER_REGEX = /\|\|[\s\S]+?\|\|/g;

const detectSpoilers = (rule: AutomodSpoilersRule): ((content: string) => boolean) => {
  return (content) => (content.match(SPOILER_REGEX) ?? []).length > rule.maxCount;
};

const USER_MENTION_REGEX = /<@!?\d+>/g;
const ROLE_MENTION_REGEX = /<@&\d+>/g;

const detectMentions = (rule: AutomodMentionsRule): ((content: string) => boolean) => {
  return (content) => {
    let count = (content.match(USER_MENTION_REGEX) ?? []).length;
    if (rule.includeRoles) count += (content.match(ROLE_MENTION_REGEX) ?? []).length;
    return count > rule.maxCount;
  };
};

// `\p{M}` couvre toute Unicode Mark (Mn = Nonspacing_Mark, Me = Enclosing_Mark,
// Mc = Spacing_Mark) sans piège du Misleading Character Class qui mélangerait
// un char de base avec une combining mark.
const COMBINING_MARK_REGEX = /\p{M}/gu;

const detectZalgo = (rule: AutomodZalgoRule): ((content: string) => boolean) => {
  return (content) => {
    if (content.length < 4) return false;
    const marks = (content.match(COMBINING_MARK_REGEX) ?? []).length;
    return marks / content.length >= rule.ratio;
  };
};

const detectKeywordList = (rule: AutomodKeywordListRule): ((content: string) => boolean) => {
  // Pré-compute le pool une fois (cache lifecycle = lifetime du handler) :
  // `vocab` (curated FR/EN seedé) + `customWords` admin. Tout est
  // normalisé pour le match insensitive accent + casse.
  const seeded = vocabularyFor(rule.language, rule.categories);
  const allWords = [...seeded, ...rule.customWords]
    .map(normalizeForMatch)
    .filter((w) => w.length > 0);
  return (content) => {
    if (allWords.length === 0) return false;
    const haystack = normalizeForMatch(content);
    return allWords.some((w) => haystack.includes(w));
  };
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
 *
 * Logging :
 * - `debug` à chaque appel avec le retour brut + normalisé (visible
 *   sous `LOG_LEVEL=debug` côté serveur).
 * - `warn` si l'appel `ai.classify` throw (provider down, 4xx/5xx,
 *   timeout, JSON invalide). Sans ce log, une AI cassée serait
 *   indiscernable d'une AI qui répond systématiquement `safe`.
 */
async function classifyAgainst(
  logger: ModuleContext['logger'],
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
  } catch (error) {
    logger.warn('automod : ai.classify a échoué', {
      ruleId: rule.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  const normalized = result.trim().toLowerCase();
  logger.debug('automod : ai.classify résultat', {
    ruleId: rule.id,
    raw: result,
    normalized,
    matched:
      normalized !== 'safe' && (rule.categories as ReadonlyArray<string>).includes(normalized),
  });
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
type EvalMatchSyncKind =
  | 'blacklist'
  | 'regex'
  | 'rate-limit'
  | 'invites'
  | 'links'
  | 'caps'
  | 'emojis'
  | 'spoilers'
  | 'mentions'
  | 'zalgo'
  | 'keyword-list';

type EvalMatch =
  | { readonly kind: EvalMatchSyncKind; readonly rule: AutomodRule }
  | {
      readonly kind: 'ai-classify';
      readonly rule: AutomodAiClassifyRule;
      readonly category: AutomodAiCategory;
    };

/** Tag d'effet appliqué — recouvre les actions résolues + les échecs partiels. */
type AppliedTag = 'delete' | 'warn' | 'mute' | 'mute-no-role';

/**
 * Applique en séquence les actions d'une règle qui a matché. Pipeline :
 *
 * 1. `delete` (si demandé) : supprime le message au plus tôt — un
 *    `addMemberRole` qui échouerait ensuite ne laissera pas le
 *    contenu offensant en place.
 * 2. `mute`   (si demandé) : assigne le rôle muet et programme
 *    optionnellement la levée via le scheduler.
 * 3. `warn`   (si demandé) : pas d'action Discord-side, juste un tag.
 *    Le DM consolidé en fin de pipeline tient lieu d'avertissement.
 * 4. DM unique récapitulatif (si `dmOnSanction` et au moins une
 *    sanction visible appliquée). On choisit le « plus fort » des
 *    styles disponibles : `tempmute` > `mute` > `warn` (delete utilise
 *    aussi le template warn). Évite N DMs séparés pour une seule règle.
 *
 * Les ordres `delete` puis `mute` sont volontaires : si `addMemberRole`
 * lève (perms manquantes), on a déjà au moins kill le message.
 */
const applyActions = async (
  ctx: ModuleContext,
  event: GuildMessageCreateEvent,
  rule: AutomodRule,
  mutedRoleId: string | null,
  dmOnSanction: boolean,
): Promise<{ readonly applied: ReadonlyArray<AppliedTag> }> => {
  const guildName = ctx.discord.getGuildName(event.guildId) ?? 'le serveur';
  const applied: AppliedTag[] = [];
  const wants = (a: 'delete' | 'warn' | 'mute'): boolean => rule.actions.includes(a);

  if (wants('delete')) {
    try {
      await ctx.discord.deleteMessage(event.channelId, event.messageId);
      applied.push('delete');
    } catch (error) {
      ctx.logger.debug('automod : deleteMessage a échoué', {
        messageId: event.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let muteSucceeded = false;
  if (wants('mute')) {
    if (mutedRoleId === null) {
      ctx.logger.warn('automod : action mute demandée sans mutedRoleId configuré', {
        ruleId: rule.id,
      });
      applied.push('mute-no-role');
    } else {
      try {
        await ctx.discord.addMemberRole(event.guildId, event.authorId, mutedRoleId as RoleId);
        muteSucceeded = true;
        applied.push('mute');
      } catch (error) {
        ctx.logger.warn('automod : addMemberRole a échoué', {
          authorId: event.authorId,
          error: error instanceof Error ? error.message : String(error),
        });
        applied.push('mute-no-role');
      }
      if (muteSucceeded && rule.durationMs !== null) {
        const jobKey = `moderation:automod-mute:${event.guildId}:${event.authorId}:${rule.id}`;
        await ctx.scheduler.in(rule.durationMs, jobKey, async () => {
          try {
            await ctx.discord.removeMemberRole(
              event.guildId,
              event.authorId,
              mutedRoleId as RoleId,
            );
          } catch {
            // ignore — admin peut unmute manuellement
          }
        });
      }
    }
  }

  if (wants('warn')) {
    applied.push('warn');
  }

  // DM consolidé : envoyé seulement si au moins une sanction visible a abouti.
  // `mute-no-role` seul ne donne aucun feedback utilisateur (mute pas appliqué,
  // pas de delete, pas de warn) — on garde le silence côté DM dans ce cas.
  const visibleSanction =
    applied.includes('mute') || applied.includes('delete') || applied.includes('warn');

  if (dmOnSanction && visibleSanction) {
    const dmAction: 'warn' | 'mute' | 'tempmute' = muteSucceeded
      ? rule.durationMs !== null
        ? 'tempmute'
        : 'mute'
      : 'warn';
    const dmReason = applied.includes('delete')
      ? `Message supprimé par automod : ${rule.label}`
      : `Règle automod : ${rule.label}`;
    void sendSanctionDm(ctx, event.authorId as UserId, {
      action: dmAction,
      guildName,
      reason: dmReason,
      ...(muteSucceeded && rule.durationMs !== null
        ? { durationFormatted: `${Math.round(rule.durationMs / 1000)} s` }
        : {}),
    });
  }

  return { applied };
};

// ─── Restricted channels ────────────────────────────────────────────

const IMAGE_MIME_PREFIXES = ['image/'];
const VIDEO_MIME_PREFIXES = ['video/'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.heic', '.bmp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];

const attachmentMatchesType = (
  attachment: GuildMessageCreateEvent['attachments'][number],
  kind: 'image' | 'video',
): boolean => {
  const ct = (attachment.contentType ?? '').toLowerCase();
  const prefixes = kind === 'image' ? IMAGE_MIME_PREFIXES : VIDEO_MIME_PREFIXES;
  if (prefixes.some((p) => ct.startsWith(p))) return true;
  // Fallback : extension de filename. Discord ne fournit pas toujours
  // un `contentType` (CDN frais, vieux upload).
  const filename = (attachment.filename ?? attachment.url ?? '').toLowerCase();
  const exts = kind === 'image' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
  return exts.some((ext) => filename.endsWith(ext));
};

/**
 * Évalue les modes d'un salon restreint contre un message. Retourne
 * `true` si le message satisfait AU MOINS UN des modes (donc passe).
 * Retourne `false` si tous les modes sont violés (le message sera
 * supprimé par le caller).
 *
 * Modes :
 * - `commands` : message commence par `/`. Avec slash commands natifs
 *   Discord, ces messages n'arrivent pas en `messageCreate` — utiliser
 *   ce mode revient à accepter UNIQUEMENT les rares cas de raw `/X`
 *   tapé par un membre. Conservé pour parité MEE6.
 * - `images`   : au moins un attachement type image.
 * - `videos`   : au moins un attachement type vidéo.
 */
const messageSatisfiesRestrictedModes = (
  event: GuildMessageCreateEvent,
  modes: ReadonlyArray<RestrictedChannel['modes'][number]>,
): boolean => {
  for (const mode of modes) {
    if (mode === 'commands' && event.content.trimStart().startsWith('/')) return true;
    if (mode === 'images' && event.attachments.some((a) => attachmentMatchesType(a, 'image'))) {
      return true;
    }
    if (mode === 'videos' && event.attachments.some((a) => attachmentMatchesType(a, 'video'))) {
      return true;
    }
  }
  return false;
};

/**
 * Cherche dans la config des `restrictedChannels` celle qui correspond
 * au salon de l'event. Retourne `null` si le salon n'est pas restreint.
 */
const findRestrictedChannel = (
  cfg: ModerationConfig,
  channelId: string,
): RestrictedChannel | null => {
  const found = cfg.restrictedChannels.find((rc) => rc.channelId === channelId);
  return found ?? null;
};

/**
 * Applique la politique de salon restreint : supprime le message
 * silencieusement (sans audit, sans DM agressif) — c'est une politique
 * de salon, pas une sanction de comportement. On envoie un DM info
 * uniquement si `dmOnSanction` est actif.
 */
const applyRestrictedChannelPolicy = async (
  ctx: ModuleContext,
  event: GuildMessageCreateEvent,
  restricted: RestrictedChannel,
  dmOnSanction: boolean,
): Promise<void> => {
  try {
    await ctx.discord.deleteMessage(event.channelId, event.messageId);
  } catch (error) {
    ctx.logger.debug('automod restricted-channel : deleteMessage a échoué', {
      channelId: event.channelId,
      messageId: event.messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (dmOnSanction) {
    const guildName = ctx.discord.getGuildName(event.guildId) ?? 'le serveur';
    void sendSanctionDm(ctx, event.authorId as UserId, {
      action: 'warn',
      guildName,
      reason: `Salon restreint : seuls les contenus de type ${restricted.modes.join(' / ')} sont acceptés.`,
    });
  }
  void ctx.audit.log({
    guildId: event.guildId,
    action: ACTION_AUTOMOD_TRIGGERED,
    actor: { type: 'module', id: 'moderation' as never },
    target: { type: 'user', id: event.authorId },
    severity: 'info',
    metadata: {
      restrictedChannel: true,
      channelId: event.channelId,
      messageId: event.messageId,
      modes: restricted.modes,
    },
  });
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
    let moderationCfg: ModerationConfig;
    let mutedRoleId: string | null;
    let dmOnSanction: boolean;
    try {
      const raw = await ctx.config.get(event.guildId);
      moderationCfg = resolveConfig(raw);
      cfg = moderationCfg.automod;
      mutedRoleId = moderationCfg.mutedRoleId;
      dmOnSanction = moderationCfg.dmOnSanction;
    } catch (error) {
      ctx.logger.debug('automod : config indisponible, skip', {
        guildId: event.guildId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Étape 0 : politique de salon restreint. Évalué AVANT bypass +
    // règles : un mod n'est PAS exempté de la politique de salon (c'est
    // une politique de canal, pas une sanction de comportement). Un
    // bot n'arrive jamais ici (filtre amont dans `client-adapter`).
    const restricted = findRestrictedChannel(moderationCfg, event.channelId);
    if (restricted !== null && !messageSatisfiesRestrictedModes(event, restricted.modes)) {
      await applyRestrictedChannelPolicy(ctx, event, restricted, dmOnSanction);
      return;
    }

    if (cfg.rules.length === 0) return;

    // Les règles textuelles ne peuvent rien matcher sur un message
    // vide. `rate-limit` compte même les messages embed-only — pareil
    // pour `mentions` / `emojis` / `caps` / etc., qui se basent sur
    // le content textuel et seraient inertes sur un embed seul.
    const TEXTUAL_KINDS: ReadonlySet<string> = new Set([
      'blacklist',
      'regex',
      'ai-classify',
      'invites',
      'links',
      'caps',
      'emojis',
      'spoilers',
      'mentions',
      'zalgo',
      'keyword-list',
    ]);
    const hasOnlyTextualRules = cfg.rules.every((r) => TEXTUAL_KINDS.has(r.kind));
    if (event.content.length === 0 && hasOnlyTextualRules) return;

    if (await isBypassedAuthor(ctx, event.guildId, event.authorId, cfg.bypassRoleIds)) {
      return;
    }

    // `ctx.ai` est figé à l'instant du `onLoad` (sans guildId connu)
    // et vaut `null` pour ce module — on résout donc par-event via
    // `ctx.aiFor(event.guildId)`. Le runtime côté server.ts mémoïse
    // l'AIService par-guild et invalide à `config.changed`.
    const matched = await evaluateRulesAgainst(cfg.rules, {
      content: event.content,
      event,
      nowMs: now(),
      rateLimit,
      ai: ctx.aiFor(event.guildId),
      logger: ctx.logger,
    });
    if (matched === null) return;

    ctx.logger.info('automod : règle déclenchée', {
      guildId: event.guildId,
      authorId: event.authorId,
      ruleId: matched.rule.id,
      ruleKind: matched.rule.kind,
      actions: matched.rule.actions,
      ...(matched.kind === 'ai-classify' ? { aiCategory: matched.category } : {}),
    });

    const result = await applyActions(ctx, event, matched.rule, mutedRoleId, dmOnSanction);

    // Severity : `info` si seul `warn` (rappel doux), `warn` dès qu'on
    // a effectivement supprimé / muté.
    const severity =
      result.applied.includes('delete') || result.applied.includes('mute') ? 'warn' : 'info';

    void ctx.audit.log({
      guildId: event.guildId,
      action: ACTION_AUTOMOD_TRIGGERED,
      actor: { type: 'module', id: 'moderation' as never },
      target: { type: 'user', id: event.authorId },
      severity,
      metadata: {
        ruleId: matched.rule.id,
        ruleLabel: matched.rule.label,
        ruleKind: matched.rule.kind,
        actions: matched.rule.actions,
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
  /** Logger optionnel pour la trace des appels `classify`. */
  readonly logger?: ModuleContext['logger'];
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
  // Pass 1 : règles synchrones (textuelles, structurelles, rate-limit).
  // Toutes gratuites côté coût — la première qui matche gagne.
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
      continue;
    }
    if (rule.kind === 'invites') {
      if (detectInvites(rule)(ctx.content)) return { kind: 'invites', rule };
      continue;
    }
    if (rule.kind === 'links') {
      if (detectLinks(rule)(ctx.content)) return { kind: 'links', rule };
      continue;
    }
    if (rule.kind === 'caps') {
      if (detectCaps(rule)(ctx.content)) return { kind: 'caps', rule };
      continue;
    }
    if (rule.kind === 'emojis') {
      if (detectEmojis(rule)(ctx.content)) return { kind: 'emojis', rule };
      continue;
    }
    if (rule.kind === 'spoilers') {
      if (detectSpoilers(rule)(ctx.content)) return { kind: 'spoilers', rule };
      continue;
    }
    if (rule.kind === 'mentions') {
      if (detectMentions(rule)(ctx.content)) return { kind: 'mentions', rule };
      continue;
    }
    if (rule.kind === 'zalgo') {
      if (detectZalgo(rule)(ctx.content)) return { kind: 'zalgo', rule };
      continue;
    }
    if (rule.kind === 'keyword-list') {
      if (detectKeywordList(rule)(ctx.content)) return { kind: 'keyword-list', rule };
    }
  }

  // Pass 2 : classification IA — un seul appel par message, dirigé
  // sur la première règle IA active.
  if (ctx.ai === null) return null;
  // Logger no-op si pas fourni (cas test). En prod, l'automod handler
  // passe `ctx.logger`.
  const logger: ModuleContext['logger'] = ctx.logger ?? {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => logger,
  };
  for (const rule of rules) {
    if (!rule.enabled || rule.kind !== 'ai-classify') continue;
    const category = await classifyAgainst(logger, ctx.ai, rule, ctx.content);
    if (category !== null) {
      return { kind: 'ai-classify', rule, category };
    }
  }
  return null;
}
