import type { PublishReactionRolePairInput } from '../../../lib/reaction-roles-actions';
import type { ReactionRoleTemplate } from '../templates';
import type { ReactionRoleMessageClient, ReactionRolePairClient } from '../types';
import type { PairDraft } from './editor-types';

/**
 * Helpers purs pour le brouillon d'éditeur reaction-role : parse
 * d'emoji, validation, factory de drafts, conversion existing →
 * draft. Tout est testé unitairement et indépendant de React.
 */

/** Sérialise une emoji structurée (stockée) en texte brut pour affichage. */
export function serializeEmoji(emoji: ReactionRolePairClient['emoji']): string {
  if (emoji.type === 'unicode') return emoji.value;
  const prefix = emoji.animated ? '<a:' : '<:';
  return `${prefix}${emoji.name}:${emoji.id}>`;
}

/**
 * Parse un texte brut vers la structure emoji attendue par l'API.
 * Accepte :
 *  - Forme custom Discord : `<:name:id>` ou `<a:name:id>`
 *  - Tout autre texte : traité comme unicode (trimmed).
 */
export function parseEmoji(raw: string): PublishReactionRolePairInput['emoji'] | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const customMatch = /^<(a?):([^:]+):(\d{17,19})>$/.exec(trimmed);
  if (customMatch) {
    const [, animated, name, id] = customMatch;
    if (name === undefined || id === undefined) return null;
    return {
      type: 'custom' as const,
      id,
      name,
      animated: animated === 'a',
    };
  }

  return { type: 'unicode', value: trimmed };
}

/** Construit la structure emoji client depuis un texte brut. */
export function buildClientEmoji(raw: string): ReactionRolePairClient['emoji'] | null {
  const parsed = parseEmoji(raw);
  if (!parsed) return null;
  if (parsed.type === 'unicode') return parsed;
  return { type: 'custom', id: parsed.id, name: parsed.name, animated: parsed.animated ?? false };
}

/** Valide qu'un brouillon de paire est complet. */
export function isPairValid(p: PairDraft): boolean {
  if (!parseEmoji(p.emoji)) return false;
  if (p.roleMode === 'existing') return p.roleId.length > 0;
  return p.roleName.trim().length > 0;
}

let _uidCounter = 0;
const nextUid = (): string => `p-${(_uidCounter++).toString()}`;

/** Helpers de fabrique de drafts. */
export function makeReactionDraft(opts: { emoji?: string; roleName?: string } = {}): PairDraft {
  return {
    uid: nextUid(),
    kind: 'reaction',
    emoji: opts.emoji ?? '',
    label: '',
    style: 'secondary',
    roleMode: 'create',
    roleName: opts.roleName ?? '',
  };
}

export function makeButtonDraft(): PairDraft {
  return {
    uid: nextUid(),
    kind: 'button',
    emoji: '',
    label: '',
    style: 'primary',
    roleMode: 'create',
    roleName: '',
  };
}

/** Initialise les paires depuis un template (mode new). */
export function pairsFromTemplate(template: ReactionRoleTemplate): PairDraft[] {
  if (template.suggestions.length === 0) {
    return [makeReactionDraft({ emoji: '', roleName: '' })];
  }
  return template.suggestions.map((s) =>
    makeReactionDraft({ emoji: s.emoji, roleName: s.roleName }),
  );
}

/** Initialise les paires depuis un message existant (mode edit). */
export function pairsFromExisting(existing: ReactionRoleMessageClient): PairDraft[] {
  return existing.pairs.map(
    (p): PairDraft => ({
      uid: nextUid(),
      kind: p.kind,
      emoji: serializeEmoji(p.emoji),
      label: p.label,
      style: p.style,
      roleMode: 'existing',
      roleId: p.roleId,
    }),
  );
}

/**
 * Construit la version client d'une paire à passer à `onSaved` du
 * shell (pour mettre à jour l'état parent sans refetch).
 */
export function buildClientPair(p: PairDraft): ReactionRolePairClient {
  const emoji = buildClientEmoji(p.emoji);
  const roleId = p.roleMode === 'existing' ? p.roleId : '';
  return {
    kind: p.kind,
    emoji: emoji ?? ({ type: 'unicode', value: p.emoji } as const),
    roleId,
    label: p.label,
    style: p.style,
  };
}

/**
 * Indique si l'éditeur est dans un état valide pour publication.
 * Centralise la logique pour le shell + la sticky bar.
 */
export interface EditorValidationState {
  readonly hasButton: boolean;
  readonly ephemeralWithoutButton: boolean;
  readonly isValid: boolean;
}

export function evaluateEditorValidity(args: {
  readonly label: string;
  readonly channelId: string;
  readonly message: string;
  readonly pairs: readonly PairDraft[];
  readonly feedbackChoice: 'dm' | 'ephemeral' | 'none';
}): EditorValidationState {
  const hasButton = args.pairs.some((p) => p.kind === 'button');
  const ephemeralWithoutButton = args.feedbackChoice === 'ephemeral' && !hasButton;
  const isValid =
    args.label.trim() !== '' &&
    args.channelId !== '' &&
    args.message.trim() !== '' &&
    args.pairs.length > 0 &&
    args.pairs.every(isPairValid) &&
    !ephemeralWithoutButton;
  return { hasButton, ephemeralWithoutButton, isValid };
}
