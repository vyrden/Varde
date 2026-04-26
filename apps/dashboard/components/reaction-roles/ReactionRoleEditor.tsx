'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Separator,
  Textarea,
} from '@varde/ui';
import { useState, useTransition } from 'react';

import {
  type PublishReactionRoleInput,
  type PublishReactionRolePairInput,
  publishReactionRole,
  syncReactionRole,
} from '../../lib/reaction-roles-actions';
import { formatReactionRoleReason } from '../../lib/reaction-roles-reasons';
import { EmojiPicker } from './EmojiPicker';
import type {
  EmojiCatalog,
  ReactionRoleButtonStyleClient,
  ReactionRoleMessageClient,
  ReactionRolePairClient,
  ReactionRolePairKindClient,
} from './ReactionRolesConfigEditor';
import type { ReactionRoleTemplate } from './templates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Brouillon local d'une paire pendant l'édition. L'emoji reste un
 * texte brut tant qu'il n'a pas été parsé (l'utilisateur peut coller
 * `<:nom:id>` ou taper un emoji unicode), et le rôle est soit choisi
 * dans la liste existante soit nommé pour création.
 */
type PairDraft = {
  uid: string;
  kind: ReactionRolePairKindClient;
  emoji: string;
  /** Pour kind=button uniquement. */
  label: string;
  /** Pour kind=button uniquement. */
  style: ReactionRoleButtonStyleClient;
} & ({ roleMode: 'existing'; roleId: string } | { roleMode: 'create'; roleName: string });

type EditorMode = 'normal' | 'unique' | 'verifier';
type EditorFeedback = 'dm' | 'ephemeral' | 'none';

interface FeedbackState {
  kind: 'success' | 'error';
  message: string;
}

export type ReactionRoleEditorProps =
  | {
      readonly mode: 'new';
      readonly guildId: string;
      readonly template: ReactionRoleTemplate;
      readonly channels: readonly ChannelOption[];
      readonly roles: readonly RoleOption[];
      readonly emojis: EmojiCatalog;
      readonly onSaved: (newRR: ReactionRoleMessageClient) => void;
      readonly onCancel: () => void;
    }
  | {
      readonly mode: 'edit';
      readonly guildId: string;
      readonly existing: ReactionRoleMessageClient;
      readonly channels: readonly ChannelOption[];
      readonly roles: readonly RoleOption[];
      readonly emojis: EmojiCatalog;
      readonly onSaved: (updated: ReactionRoleMessageClient) => void;
      readonly onCancel: () => void;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sérialise une emoji structurée (stockée) en texte brut pour affichage. */
function serializeEmoji(emoji: ReactionRolePairClient['emoji']): string {
  if (emoji.type === 'unicode') return emoji.value;
  const prefix = emoji.animated ? '<a:' : '<:';
  return `${prefix}${emoji.name}:${emoji.id}>`;
}

/**
 * Parse un texte brut vers la structure emoji attendue par l'API.
 * Accepte :
 *  - Forme custom Discord : `<:name:id>` ou `<a:name:id>`
 *  - Tout autre texte : traité comme unicode (trimmed).
 *
 * @public Exportée pour les tests unitaires.
 */
export function parseEmoji(raw: string): PublishReactionRolePairInput['emoji'] | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const customMatch = /^<(a?):([^:]+):(\d{17,19})>$/.exec(trimmed);
  if (customMatch) {
    const [, animated, name, id] = customMatch;
    return {
      type: 'custom',
      id: id as string,
      name: name as string,
      animated: animated === 'a',
    };
  }

  return { type: 'unicode', value: trimmed };
}

/** Construit la structure emoji client depuis un texte brut. */
function buildClientEmoji(raw: string): ReactionRolePairClient['emoji'] | null {
  const parsed = parseEmoji(raw);
  if (!parsed) return null;
  if (parsed.type === 'unicode') return parsed;
  return { type: 'custom', id: parsed.id, name: parsed.name, animated: parsed.animated ?? false };
}

/**
 * Valide qu'un brouillon de paire est complet.
 *
 * @public Exportée pour les tests unitaires.
 */
export function isPairValid(p: PairDraft): boolean {
  if (!parseEmoji(p.emoji)) return false;
  if (p.roleMode === 'existing') return p.roleId.length > 0;
  return p.roleName.trim().length > 0;
}

let _uidCounter = 0;
const nextUid = (): string => `p-${(_uidCounter++).toString()}`;

/** Initialise les paires depuis un template (mode new). */
function pairsFromTemplate(template: ReactionRoleTemplate): PairDraft[] {
  if (template.suggestions.length === 0) {
    return [makeReactionDraft({ emoji: '', roleName: '' })];
  }
  return template.suggestions.map((s) =>
    makeReactionDraft({ emoji: s.emoji, roleName: s.roleName }),
  );
}

/** Initialise les paires depuis un message existant (mode edit). */
function pairsFromExisting(existing: ReactionRoleMessageClient): PairDraft[] {
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

/** Helpers de fabrique de drafts. */
function makeReactionDraft(opts: { emoji?: string; roleName?: string } = {}): PairDraft {
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

function makeButtonDraft(): PairDraft {
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

// ---------------------------------------------------------------------------
// Icônes
// ---------------------------------------------------------------------------

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.7 8h5.6l.7-8M6 6.5v4M8 6.5v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9" cy="3.5" r="1" fill="currentColor" />
      <circle cx="5" cy="7" r="1" fill="currentColor" />
      <circle cx="9" cy="7" r="1" fill="currentColor" />
      <circle cx="5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="9" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-component : éditeur d'un élément (réaction OU bouton)
// ---------------------------------------------------------------------------

const STYLE_OPTIONS: ReadonlyArray<{
  readonly value: ReactionRoleButtonStyleClient;
  readonly label: string;
  readonly swatchClass: string;
}> = [
  { value: 'primary', label: 'Bleu', swatchClass: 'bg-[#5865f2]' },
  { value: 'secondary', label: 'Gris', swatchClass: 'bg-[#4e5058]' },
  { value: 'success', label: 'Vert', swatchClass: 'bg-[#248046]' },
  { value: 'danger', label: 'Rouge', swatchClass: 'bg-[#da373c]' },
];

function ElementRow({
  pair,
  index,
  roles,
  emojis,
  canRemove,
  onChange,
  onRemove,
}: {
  readonly pair: PairDraft;
  readonly index: number;
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  readonly canRemove: boolean;
  readonly onChange: (updated: PairDraft) => void;
  readonly onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateEmoji = (value: string) => {
    onChange({ ...pair, emoji: value });
  };

  const updateRoleMode = (next: 'existing' | 'create') => {
    if (next === 'existing') {
      onChange({
        uid: pair.uid,
        kind: pair.kind,
        emoji: pair.emoji,
        label: pair.label,
        style: pair.style,
        roleMode: 'existing',
        roleId: '',
      });
    } else {
      onChange({
        uid: pair.uid,
        kind: pair.kind,
        emoji: pair.emoji,
        label: pair.label,
        style: pair.style,
        roleMode: 'create',
        roleName: '',
      });
    }
  };

  const isButton = pair.kind === 'button';
  const ringClass = isButton
    ? 'ring-1 ring-primary/30 bg-primary/[0.03]'
    : 'ring-1 ring-border bg-card';

  return (
    <div className={`relative flex flex-col gap-3 rounded-lg p-3 ${ringClass}`}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-5 cursor-grab items-center justify-center text-muted-foreground/50"
          title="Réordonner (à venir)"
        >
          <GripIcon />
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            isButton ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {isButton ? '◆ Bouton' : '⊙ Réaction'}
        </span>
        <span className="ml-auto" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Supprimer l'élément ${index + 1}`}
          title="Supprimer cet élément"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <TrashIcon />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
        {/* Emoji */}
        <div className="relative flex items-center gap-1">
          <Input
            id={`elt-emoji-${index}`}
            type="text"
            value={pair.emoji}
            placeholder="😀"
            maxLength={64}
            onChange={(e) => updateEmoji(e.target.value)}
            className="h-9 w-20 text-center text-lg"
            aria-label={`Emoji de l'élément ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Ouvrir le sélecteur d'emoji"
            aria-expanded={pickerOpen}
            title="Sélecteur d'emoji"
          >
            <span aria-hidden="true">😀</span>
          </Button>
          {pickerOpen ? (
            <EmojiPicker
              catalog={emojis}
              onPick={(raw) => updateEmoji(raw)}
              onClose={() => setPickerOpen(false)}
            />
          ) : null}
        </div>

        {/* Rôle (existant ou à créer) */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={pair.roleMode}
            onChange={(e) => updateRoleMode(e.target.value as 'existing' | 'create')}
            wrapperClassName="w-44 shrink-0"
            aria-label={`Mode rôle de l'élément ${index + 1}`}
          >
            <option value="existing">Rôle existant</option>
            <option value="create">Créer un rôle</option>
          </Select>

          {pair.roleMode === 'existing' ? (
            <Select
              value={pair.roleId}
              onChange={(e) =>
                onChange({
                  uid: pair.uid,
                  kind: pair.kind,
                  emoji: pair.emoji,
                  label: pair.label,
                  style: pair.style,
                  roleMode: 'existing',
                  roleId: e.target.value,
                })
              }
              wrapperClassName="flex-1 min-w-40"
              aria-label={`Rôle existant de l'élément ${index + 1}`}
            >
              <option value="">— choisir —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              type="text"
              value={pair.roleName}
              placeholder="Nom du rôle à créer"
              maxLength={100}
              onChange={(e) =>
                onChange({
                  uid: pair.uid,
                  kind: pair.kind,
                  emoji: pair.emoji,
                  label: pair.label,
                  style: pair.style,
                  roleMode: 'create',
                  roleName: e.target.value,
                })
              }
              className="flex-1 min-w-40"
              aria-label={`Nom du rôle à créer pour l'élément ${index + 1}`}
            />
          )}
        </div>
      </div>

      {/* Bloc spécifique aux boutons : label + style */}
      {isButton ? (
        <div className="grid grid-cols-1 gap-3 border-t border-border/40 pt-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor={`elt-label-${index}`} className="text-xs text-muted-foreground">
              Texte du bouton (optionnel — par défaut, le nom du rôle)
            </Label>
            <Input
              id={`elt-label-${index}`}
              type="text"
              value={pair.label}
              placeholder="Texte court (max 80 caractères)"
              maxLength={80}
              onChange={(e) => onChange({ ...pair, label: e.target.value })}
            />
          </div>

          <fieldset className="space-y-1">
            <legend className="text-xs text-muted-foreground">Couleur</legend>
            <div className="flex gap-1.5">
              {STYLE_OPTIONS.map((opt) => {
                const checked = pair.style === opt.value;
                return (
                  <label
                    key={opt.value}
                    title={opt.label}
                    className={`size-9 cursor-pointer rounded-md border-2 transition-all ${opt.swatchClass} ${
                      checked
                        ? 'scale-110 border-foreground'
                        : 'border-transparent hover:border-foreground/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`elt-${index}-style`}
                      value={opt.value}
                      checked={checked}
                      onChange={() => onChange({ ...pair, style: opt.value })}
                      className="sr-only"
                      aria-label={opt.label}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component : aperçu Discord
// ---------------------------------------------------------------------------

function DiscordPreview({
  message,
  pairs,
  rolesById,
}: {
  readonly message: string;
  readonly pairs: readonly PairDraft[];
  readonly rolesById: ReadonlyMap<string, string>;
}) {
  const reactions = pairs.filter((p) => p.kind === 'reaction');
  const buttons = pairs.filter((p) => p.kind === 'button');

  const renderEmoji = (raw: string): string => {
    if (raw.trim().length === 0) return '·';
    if (raw.startsWith('<')) return `:${raw.replace(/^<a?:([^:]+):.*$/, '$1')}:`;
    return raw;
  };

  const buttonLabel = (p: PairDraft): string => {
    if (p.label.trim().length > 0) return p.label;
    if (p.roleMode === 'existing' && p.roleId.length > 0) {
      return rolesById.get(p.roleId) ?? 'rôle';
    }
    if (p.roleMode === 'create' && p.roleName.trim().length > 0) return p.roleName;
    return 'rôle';
  };

  const styleClasses: Record<ReactionRoleButtonStyleClient, string> = {
    primary: 'bg-[#5865f2] text-white hover:bg-[#4752c4]',
    secondary: 'bg-[#4e5058] text-white hover:bg-[#6d6f78]',
    success: 'bg-[#248046] text-white hover:bg-[#1a6334]',
    danger: 'bg-[#da373c] text-white hover:bg-[#a12828]',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Aperçu Discord</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="rounded-md bg-[#36393f] p-3 font-sans text-sm text-white">
          <p className="mb-1 text-xs font-semibold text-[#96989d]">Varde Bot</p>
          <p className="whitespace-pre-wrap wrap-break-word">
            {message.length > 0 ? message : <span className="opacity-50">Contenu du message…</span>}
          </p>
          {buttons.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {buttons.map((p) => (
                <span
                  key={p.uid}
                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${styleClasses[p.style]}`}
                >
                  <span aria-hidden="true">{renderEmoji(p.emoji)}</span>
                  <span>{buttonLabel(p)}</span>
                </span>
              ))}
            </div>
          ) : null}
          {reactions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {reactions.map((p) => (
                <span
                  key={p.uid}
                  className="rounded bg-[#2f3136] px-1.5 py-0.5 text-base leading-none"
                >
                  {renderEmoji(p.emoji)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Aperçu indicatif — le rendu final peut varier selon Discord.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MODE_OPTIONS: ReadonlyArray<{
  readonly value: EditorMode;
  readonly label: string;
  readonly desc: string;
}> = [
  {
    value: 'normal',
    label: 'Normal',
    desc: 'Plusieurs rôles possibles, ajout/retrait libre.',
  },
  {
    value: 'unique',
    label: 'Unique',
    desc: 'Un seul rôle à la fois (swap automatique).',
  },
  {
    value: 'verifier',
    label: 'Vérificateur',
    desc: 'Pré-pensé pour la validation des règles.',
  },
];

const FEEDBACK_OPTIONS: ReadonlyArray<{
  readonly value: EditorFeedback;
  readonly label: string;
  readonly hint: string;
}> = [
  {
    value: 'dm',
    label: 'DM (message privé)',
    hint: "Pour les réactions et les boutons. Échoue silencieusement si l'utilisateur a fermé ses DMs.",
  },
  {
    value: 'ephemeral',
    label: 'Réponse éphémère',
    hint: "Réservé aux clics sur boutons. « Seul toi peux voir » — n'apparaît dans aucun salon.",
  },
  {
    value: 'none',
    label: 'Aucun (silencieux)',
    hint: 'Le rôle est attribué sans confirmation visible.',
  },
];

/**
 * Formulaire de création (`mode='new'`) ou d'édition (`mode='edit'`)
 * d'un message reaction-roles. Layout 2/3 ↔ 1/3 : cards à gauche
 * (Informations / Comportement / Éléments) + Aperçu Discord à droite.
 *
 * Chaque élément est soit une **réaction emoji** (UX classique), soit
 * un **bouton Discord** (avec label + couleur, débloque le feedback
 * éphémère). Un même message peut mélanger librement des deux types.
 */
export function ReactionRoleEditor(props: ReactionRoleEditorProps) {
  const isNew = props.mode === 'new';

  const [label, setLabel] = useState<string>(
    isNew ? props.template.defaultLabel : props.existing.label,
  );
  const [channelId, setChannelId] = useState<string>(isNew ? '' : props.existing.channelId);
  const [message, setMessage] = useState<string>(
    isNew ? props.template.defaultMessage : props.existing.message,
  );
  const [mode, setMode] = useState<EditorMode>(
    isNew ? props.template.defaultMode : props.existing.mode,
  );
  const [feedbackChoice, setFeedbackChoice] = useState<EditorFeedback>(
    isNew ? 'dm' : props.existing.feedback,
  );
  const [pairs, setPairs] = useState<PairDraft[]>(
    isNew ? pairsFromTemplate(props.template) : pairsFromExisting(props.existing),
  );
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasButton = pairs.some((p) => p.kind === 'button');
  const ephemeralWithoutButton = feedbackChoice === 'ephemeral' && !hasButton;

  const isValid =
    label.trim() !== '' &&
    channelId !== '' &&
    message.trim() !== '' &&
    pairs.length > 0 &&
    pairs.every(isPairValid) &&
    !ephemeralWithoutButton;

  const handlePairChange = (index: number, updated: PairDraft) => {
    setPairs((prev) => prev.map((p, i) => (i === index ? updated : p)));
  };

  const handleAddReaction = () => {
    setPairs((prev) => [...prev, makeReactionDraft()]);
  };

  const handleAddButton = () => {
    setPairs((prev) => [...prev, makeButtonDraft()]);
  };

  const handleRemovePair = (index: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const rolesById = new Map(props.roles.map((r) => [r.id, r.name]));

  const buildApiPairs = (): PublishReactionRoleInput['pairs'] => {
    return pairs.map((p) => {
      const emoji = parseEmoji(p.emoji);
      if (!emoji) throw new Error(`Emoji invalide : "${p.emoji}"`);
      const base: PublishReactionRolePairInput = {
        kind: p.kind,
        emoji,
        ...(p.kind === 'button' ? { label: p.label, style: p.style } : {}),
      };
      if (p.roleMode === 'existing') {
        return { ...base, roleId: p.roleId };
      }
      return { ...base, roleName: p.roleName };
    });
  };

  const buildClientPair = (p: PairDraft): ReactionRolePairClient => {
    const emoji = buildClientEmoji(p.emoji);
    const roleId = p.roleMode === 'existing' ? p.roleId : '';
    return {
      kind: p.kind,
      emoji: emoji ?? ({ type: 'unicode', value: p.emoji } as const),
      roleId,
      label: p.label,
      style: p.style,
    };
  };

  const handleSubmit = () => {
    if (!isValid) return;
    setFeedback(null);

    startTransition(async () => {
      if (isNew) {
        const apiPairs = buildApiPairs();
        const result = await publishReactionRole(props.guildId, {
          label: label.trim(),
          channelId,
          message: message.trim(),
          mode,
          feedback: feedbackChoice,
          pairs: apiPairs,
        });

        if (!result.ok) {
          setFeedback({
            kind: 'error',
            message: formatReactionRoleReason(result.reason, result.detail),
          });
          return;
        }

        props.onSaved({
          id: result.id,
          label: label.trim(),
          channelId,
          messageId: result.messageId,
          message: message.trim(),
          mode,
          feedback: feedbackChoice,
          pairs: pairs.map(buildClientPair),
        });
      } else {
        const apiPairs = buildApiPairs();
        const result = await syncReactionRole(props.guildId, props.existing.messageId, {
          label: label.trim(),
          channelId,
          message: message.trim(),
          mode,
          feedback: feedbackChoice,
          pairs: apiPairs,
        });

        if (!result.ok) {
          setFeedback({
            kind: 'error',
            message: formatReactionRoleReason(result.reason),
          });
          return;
        }

        props.onSaved({
          ...props.existing,
          label: label.trim(),
          channelId,
          messageId: result.messageId ?? props.existing.messageId,
          message: message.trim(),
          mode,
          feedback: feedbackChoice,
          pairs: pairs.map(buildClientPair),
        });
      }
    });
  };

  const title = isNew ? 'Créer un reaction-role' : `Éditer « ${props.existing.label} »`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
            ← Retour
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="rr-label">Label</Label>
              <Input
                id="rr-label"
                type="text"
                value={label}
                placeholder="Ex. Couleurs de nom"
                maxLength={64}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rr-channel">Salon de publication</Label>
              <Select
                id="rr-channel"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
              >
                <option value="">— choisir un salon —</option>
                {props.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </Select>
              {!isNew && channelId !== props.existing.channelId ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Changer de salon supprime le message actuel et en repost un nouveau (les réactions
                  existantes des membres seront perdues).
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="rr-message">Contenu du message Discord</Label>
              <Textarea
                id="rr-message"
                value={message}
                placeholder="Le texte qui apparaîtra dans le message Discord…"
                maxLength={2000}
                rows={3}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                {!isNew && props.existing.message === '' ? (
                  <p className="text-xs text-muted-foreground">
                    Contenu actuel inconnu — saisis un nouveau texte si tu veux le modifier.
                  </p>
                ) : (
                  <span />
                )}
                <p className="text-xs text-muted-foreground">{message.length}/2000</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comportement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Mode d'attribution</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {MODE_OPTIONS.map((m) => (
                  <label
                    key={m.value}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors ${
                      mode === m.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="rr-mode"
                        value={m.value}
                        checked={mode === m.value}
                        onChange={() => setMode(m.value)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="font-medium text-foreground">{m.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{m.desc}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                Confirmation à l'utilisateur
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {FEEDBACK_OPTIONS.map((f) => {
                  const disabled = f.value === 'ephemeral' && !hasButton;
                  return (
                    <label
                      key={f.value}
                      className={`flex flex-col gap-1 rounded-lg border p-3 text-sm transition-colors ${
                        feedbackChoice === f.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground'
                      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      title={
                        disabled ? 'Ajoute au moins un bouton pour activer ce mode' : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="rr-feedback"
                          value={f.value}
                          checked={feedbackChoice === f.value}
                          onChange={() => !disabled && setFeedbackChoice(f.value)}
                          disabled={disabled}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-medium text-foreground">{f.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{f.hint}</span>
                    </label>
                  );
                })}
              </div>
              {ephemeralWithoutButton ? (
                <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
                  Le mode éphémère exige au moins un élément de type bouton.
                </p>
              ) : null}
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Éléments</CardTitle>
              <CardDescription>
                Mélange librement des réactions emoji et des boutons. Discord limite à 20 éléments
                par message — les boutons sont rendus sur 4 rangées de 5 max.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3">
              {pairs.map((pair, i) => (
                <ElementRow
                  key={pair.uid}
                  pair={pair}
                  index={i}
                  roles={props.roles}
                  emojis={props.emojis}
                  canRemove={pairs.length > 1}
                  onChange={(updated) => handlePairChange(i, updated)}
                  onRemove={() => handleRemovePair(i)}
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddReaction}
                disabled={pairs.length >= 20}
              >
                + Réaction emoji
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddButton}
                disabled={pairs.length >= 20}
              >
                + Bouton Discord
              </Button>
              <span className="ml-auto self-center text-xs text-muted-foreground">
                {pairs.length} / 20 élément{pairs.length > 1 ? 's' : ''}
              </span>
            </div>
          </CardContent>
        </Card>

        {feedback !== null ? (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            className={
              feedback.kind === 'success'
                ? 'flex gap-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100'
                : 'flex gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100'
            }
          >
            <span aria-hidden="true" className="font-semibold">
              {feedback.kind === 'success' ? '✓' : '⚠'}
            </span>
            <div className="flex-1">
              <p className="font-semibold">
                {feedback.kind === 'success'
                  ? 'Succès'
                  : isNew
                    ? 'Échec de la publication'
                    : 'Échec de la synchronisation'}
              </p>
              <p className="mt-0.5">{feedback.message}</p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={props.onCancel}>
            Annuler
          </Button>
          <Button type="button" disabled={!isValid || isPending} onClick={handleSubmit}>
            {isPending
              ? isNew
                ? 'Publication…'
                : 'Enregistrement…'
              : isNew
                ? 'Publier'
                : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <DiscordPreview message={message} pairs={pairs} rolesById={rolesById} />
      </aside>
    </div>
  );
}
