import type { AutomodRuleClient } from './types';

/**
 * Factories d'instances de règles vides — appelées au clic sur les
 * boutons « + <Kind> » dans la toolbar. Chaque factory pose des
 * valeurs raisonnables par défaut (label parlant, action(s) pertinente
 * pour le kind) — l'admin peut tout ajuster ensuite. Les `id` sont
 * uniques côté client (timestamp + random) — ils n'ont pas besoin
 * d'être ULID, juste stables le temps d'une session d'édition.
 */

const newRuleId = (): string =>
  `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const blankBlacklist = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'blacklist',
  pattern: '',
  actions: ['delete'],
  durationMs: null,
  enabled: true,
});

export const blankRegex = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'regex',
  pattern: '',
  actions: ['delete'],
  durationMs: null,
  enabled: true,
});

export const blankRateLimit = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'rate-limit',
  count: 5,
  windowMs: 10_000,
  scope: 'user-guild',
  actions: ['delete', 'mute'],
  durationMs: 600_000,
  enabled: true,
});

export const blankAiClassify = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'ai-classify',
  categories: ['toxicity'],
  maxContentLength: 500,
  actions: ['delete', 'warn'],
  durationMs: null,
  enabled: true,
});

export const blankInvites = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Invitations Discord',
  kind: 'invites',
  allowOwnGuild: true,
  actions: ['delete', 'warn'],
  durationMs: null,
  enabled: true,
});

export const blankLinks = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Liens externes',
  kind: 'links',
  mode: 'block-all',
  whitelist: [],
  actions: ['delete', 'warn'],
  durationMs: null,
  enabled: true,
});

export const blankCaps = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Majuscules excessives',
  kind: 'caps',
  minLength: 8,
  ratio: 0.7,
  actions: ['delete'],
  durationMs: null,
  enabled: true,
});

export const blankEmojis = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Emojis excessifs',
  kind: 'emojis',
  maxCount: 10,
  actions: ['delete'],
  durationMs: null,
  enabled: true,
});

export const blankSpoilers = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Spoilers excessifs',
  kind: 'spoilers',
  maxCount: 5,
  actions: ['delete'],
  durationMs: null,
  enabled: true,
});

export const blankMentions = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Mentions de masse',
  kind: 'mentions',
  maxCount: 5,
  includeRoles: true,
  actions: ['delete', 'warn'],
  durationMs: null,
  enabled: true,
});

export const blankZalgo = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Zalgo',
  kind: 'zalgo',
  ratio: 0.3,
  actions: ['delete'],
  durationMs: null,
  enabled: true,
});

export const blankKeywordList = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: 'Mots interdits (multi-langue)',
  kind: 'keyword-list',
  language: 'all',
  categories: ['toxicity', 'harassment'],
  customWords: [],
  actions: ['delete', 'warn'],
  durationMs: null,
  enabled: true,
});

/**
 * Vrai si la règle est utilisable côté serveur — utilisé par le
 * payload de save pour filtrer les règles incomplètes avant POST.
 */
export const isRuleComplete = (r: AutomodRuleClient): boolean => {
  if (r.label.length === 0) return false;
  if (r.kind === 'blacklist' || r.kind === 'regex') return r.pattern.length > 0;
  if (r.kind === 'rate-limit') return r.count >= 2 && r.windowMs >= 1_000;
  if (r.kind === 'ai-classify') return r.categories.length > 0;
  if (r.kind === 'keyword-list') return r.categories.length > 0;
  // invites/links/caps/emojis/spoilers/mentions/zalgo : aucun champ
  // texte requis au-delà du label.
  return true;
};
