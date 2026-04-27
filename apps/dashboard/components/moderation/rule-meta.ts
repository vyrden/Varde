import type {
  AiCategoryClient,
  AutomodActionClient,
  AutomodRuleClient,
  KeywordListLanguageClient,
  RestrictedChannelModeClient,
} from './types';

/**
 * Constantes d'affichage pour les règles automod, salons restreints,
 * actions et catégories IA. Tout ce qui est texte UI / classes
 * Tailwind statiques vit ici pour qu'un changement de palette n'oblige
 * pas à toucher la logique.
 */

export const KIND_LABEL: Record<AutomodRuleClient['kind'], string> = {
  blacklist: 'Blacklist',
  regex: 'Regex',
  'rate-limit': 'Rate-limit',
  'ai-classify': 'IA',
  invites: 'Invitations',
  links: 'Liens',
  caps: 'Majuscules',
  emojis: 'Emojis',
  spoilers: 'Spoilers',
  mentions: 'Mentions',
  zalgo: 'Zalgo',
  'keyword-list': 'Wordlist',
};

export const KIND_BADGE_CLASS: Record<AutomodRuleClient['kind'], string> = {
  blacklist: 'bg-muted text-foreground',
  regex: 'bg-muted text-foreground',
  'rate-limit': 'bg-warning/20 text-foreground',
  'ai-classify': 'bg-primary/20 text-primary',
  invites: 'bg-warning/20 text-foreground',
  links: 'bg-warning/20 text-foreground',
  caps: 'bg-muted text-foreground',
  emojis: 'bg-muted text-foreground',
  spoilers: 'bg-muted text-foreground',
  mentions: 'bg-warning/20 text-foreground',
  zalgo: 'bg-muted text-foreground',
  'keyword-list': 'bg-info/20 text-foreground',
};

/** Sous-titre court affiché à côté du badge kind dans l'éditeur de règle. */
export const KIND_HINT: Record<AutomodRuleClient['kind'], string> = {
  blacklist: 'Substring case-insensitive — mot ou phrase à bloquer.',
  regex: 'Expression régulière (flag i) — pattern textuel avancé.',
  'rate-limit': 'Sliding window — déclenche au-delà de N messages dans la fenêtre.',
  'ai-classify': 'Classification IA — catégories surveillées par le modèle.',
  invites: 'Détecte les invitations Discord (`discord.gg/`, `/invite/`).',
  links: 'Liens externes — bloque tout ou whitelist de domaines autorisés.',
  caps: 'Majuscules excessives — ratio uppercase / total lettres.',
  emojis: 'Emojis excessifs — count Unicode + custom Discord.',
  spoilers: 'Blocs `||spoiler||` excessifs.',
  mentions: 'Mentions de masse — utilisateurs (et rôles, optionnel).',
  zalgo: 'Texte chargé en marques diacritiques combinantes (effet visuel cassé).',
  'keyword-list': 'Wordlist multi-langue (FR / EN) — alternative déterministe à l’IA.',
};

/**
 * Phrase pédagogique courte pour le bouton « + <Kind> » dans la barre
 * d'ajout. Utilisée en `title` (tooltip natif). Garde-fou : 1 phrase
 * max, pas de jargon technique.
 */
export const KIND_TOOLTIP: Record<AutomodRuleClient['kind'], string> = {
  blacklist: 'Liste des mots interdits. Le bot supprime ou avertit dès qu’un mot apparaît.',
  regex: 'Pour utilisateurs avancés : pattern textuel via expression régulière.',
  'rate-limit': 'Limite le nombre de messages d’un membre sur une fenêtre de temps (anti-flood).',
  'ai-classify':
    'Le bot fait analyser chaque message par une IA et déclenche selon les catégories.',
  invites: 'Bloque les invitations vers d’autres serveurs Discord (`discord.gg/...`).',
  links: 'Bloque tous les liens externes, ou seulement ceux non listés en whitelist.',
  caps: 'Bloque les messages majoritairement en majuscules (cri).',
  emojis: 'Bloque les messages avec trop d’emojis.',
  spoilers: 'Bloque les messages avec trop de blocs spoiler.',
  mentions: 'Bloque les messages mentionnant trop de membres ou de rôles à la fois.',
  zalgo: 'Bloque les messages avec des caractères Unicode déformés (effet visuel cassé).',
  'keyword-list':
    'Liste de mots interdits multi-langue, alternative transparente à l’IA. Tu vois exactement ce qui est bloqué.',
};

/** Code couleur de l'action, repris des tokens Discord (palette automod). */
export const ACTION_DOT: Record<AutomodActionClient, string> = {
  delete: 'bg-destructive',
  warn: 'bg-warning',
  mute: 'bg-info',
};

/** Libellé court de l'action affiché dans la chip multi-sélection. */
export const ACTION_LABEL: Record<AutomodActionClient, string> = {
  delete: 'Delete',
  warn: 'Warn',
  mute: 'Mute',
};

export const ACTION_DESCRIPTION: Record<AutomodActionClient, string> = {
  delete: 'Supprime le message',
  warn: 'Envoie un DM d’avertissement',
  mute: 'Assigne le rôle muet',
};

export const ACTION_ORDER: ReadonlyArray<AutomodActionClient> = ['delete', 'warn', 'mute'];

/** Trie/déduplique pour stockage stable. */
export const normalizeActions = (
  actions: ReadonlyArray<AutomodActionClient>,
): ReadonlyArray<AutomodActionClient> => {
  const set = new Set(actions);
  return ACTION_ORDER.filter((a) => set.has(a));
};

export const AI_CATEGORY_LABEL: Record<AiCategoryClient, string> = {
  toxicity: 'Toxicité',
  harassment: 'Harcèlement',
  hate: 'Discours haineux',
  sexual: 'Sexuel',
  'self-harm': 'Auto-mutilation',
  spam: 'Spam',
};

export const KEYWORD_LANGUAGE_LABEL: Record<KeywordListLanguageClient, string> = {
  fr: 'Français',
  en: 'Anglais',
  all: 'FR + EN',
};

export const RESTRICTED_MODE_LABEL: Record<RestrictedChannelModeClient, string> = {
  commands: 'Commandes',
  images: 'Images',
  videos: 'Vidéos',
};

export const RESTRICTED_MODE_HINT: Record<RestrictedChannelModeClient, string> = {
  commands: 'Messages commençant par /',
  images: 'Au moins une image en pièce jointe',
  videos: 'Au moins une vidéo en pièce jointe',
};

/**
 * Convertit une valeur en secondes (entrée admin) vers ms pour le
 * stockage. Tronque au plus proche entier de seconde, plancher 1s.
 */
export const secondsToMs = (s: number): number => Math.max(1, Math.round(s)) * 1000;
export const msToSeconds = (ms: number): number => Math.round(ms / 1000);
