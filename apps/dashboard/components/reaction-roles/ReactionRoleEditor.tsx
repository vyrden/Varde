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
  publishReactionRole,
  syncReactionRole,
} from '../../lib/reaction-roles-actions';
import { formatReactionRoleReason } from '../../lib/reaction-roles-reasons';
import { EmojiPicker } from './EmojiPicker';
import type { EmojiCatalog, ReactionRoleMessageClient } from './ReactionRolesConfigEditor';
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

/** Paire locale (brouillon) — l'emoji est un texte brut avant parsing. */
export type PairDraft =
  | { uid: string; emoji: string; roleMode: 'existing'; roleId: string }
  | { uid: string; emoji: string; roleMode: 'create'; roleName: string };

type EditorMode = 'normal' | 'unique' | 'verifier';
type EditorFeedback = 'dm' | 'none';

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
function serializeEmoji(emoji: ReactionRoleMessageClient['pairs'][number]['emoji']): string {
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
export function parseEmoji(raw: string): PublishReactionRoleInput['pairs'][number]['emoji'] | null {
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
function buildClientEmoji(raw: string): ReactionRoleMessageClient['pairs'][number]['emoji'] | null {
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
    return [{ uid: nextUid(), emoji: '', roleMode: 'create', roleName: '' }];
  }
  return template.suggestions.map(
    (s): PairDraft => ({
      uid: nextUid(),
      emoji: s.emoji,
      roleMode: 'create',
      roleName: s.roleName,
    }),
  );
}

/** Initialise les paires depuis un message existant (mode edit). */
function pairsFromExisting(existing: ReactionRoleMessageClient): PairDraft[] {
  return existing.pairs.map(
    (p): PairDraft => ({
      uid: nextUid(),
      emoji: serializeEmoji(p.emoji),
      roleMode: 'existing',
      roleId: p.roleId,
    }),
  );
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

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 6v3.5M7 4.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-component : éditeur de paires (ligne compacte)
// ---------------------------------------------------------------------------

function PairRow({
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

  const setEmojiValue = (value: string) => {
    onChange(
      pair.roleMode === 'existing'
        ? { uid: pair.uid, roleMode: 'existing', emoji: value, roleId: pair.roleId }
        : { uid: pair.uid, roleMode: 'create', emoji: value, roleName: pair.roleName },
    );
  };

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
      <div className="relative flex items-center gap-1">
        <Input
          id={`pair-emoji-${index}`}
          type="text"
          value={pair.emoji}
          placeholder="😀"
          maxLength={64}
          onChange={(e) => setEmojiValue(e.target.value)}
          className="h-9 w-20 text-center text-lg"
          aria-label={`Emoji de la paire ${index + 1}`}
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
            onPick={(raw) => setEmojiValue(raw)}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>

      <div className="flex gap-2">
        <Select
          value={pair.roleMode}
          onChange={(e) => {
            const nextMode = e.target.value as 'existing' | 'create';
            if (nextMode === 'existing') {
              onChange({ uid: pair.uid, emoji: pair.emoji, roleMode: 'existing', roleId: '' });
            } else {
              onChange({ uid: pair.uid, emoji: pair.emoji, roleMode: 'create', roleName: '' });
            }
          }}
          wrapperClassName="w-44 shrink-0"
          aria-label={`Mode rôle de la paire ${index + 1}`}
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
                emoji: pair.emoji,
                roleMode: 'existing',
                roleId: e.target.value,
              })
            }
            wrapperClassName="flex-1"
            aria-label={`Rôle existant de la paire ${index + 1}`}
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
                emoji: pair.emoji,
                roleMode: 'create',
                roleName: e.target.value,
              })
            }
            className="flex-1"
            aria-label={`Nom du rôle à créer pour la paire ${index + 1}`}
          />
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Supprimer la paire ${index + 1}`}
        title="Supprimer la paire"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <TrashIcon />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component : aperçu Discord
// ---------------------------------------------------------------------------

function DiscordPreview({
  message,
  pairs,
}: {
  readonly message: string;
  readonly pairs: readonly PairDraft[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Aperçu Discord</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="rounded-md bg-[#36393f] p-3 font-sans text-sm text-white">
          <p className="mb-1 text-xs font-semibold text-[#96989d]">Varde Bot</p>
          <p className="whitespace-pre-wrap break-words">
            {message.length > 0 ? message : <span className="opacity-50">Contenu du message…</span>}
          </p>
          {pairs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {pairs.map((p) => {
                const display =
                  p.emoji.trim().length === 0
                    ? '·'
                    : p.emoji.startsWith('<')
                      ? `:${p.emoji.replace(/^<a?:([^:]+):.*$/, '$1')}:`
                      : p.emoji;
                return (
                  <span
                    key={p.uid}
                    className="rounded bg-[#2f3136] px-1.5 py-0.5 text-base leading-none"
                  >
                    {display}
                  </span>
                );
              })}
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
}> = [
  { value: 'dm', label: 'DM (message privé)' },
  { value: 'none', label: 'Aucune (silencieux)' },
];

/**
 * Formulaire de création (`mode='new'`) ou d'édition (`mode='edit'`)
 * d'un message reaction-roles. Layout 2/3 ↔ 1/3 : cards à gauche
 * (Informations / Comportement / Paires) + Aperçu Discord à droite.
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

  const isValid =
    label.trim() !== '' &&
    channelId !== '' &&
    message.trim() !== '' &&
    pairs.length > 0 &&
    pairs.every(isPairValid);

  const handlePairChange = (index: number, updated: PairDraft) => {
    setPairs((prev) => prev.map((p, i) => (i === index ? updated : p)));
  };

  const handleAddPair = () => {
    const newPair: PairDraft = { uid: nextUid(), emoji: '', roleMode: 'create', roleName: '' };
    setPairs((prev) => [...prev, newPair]);
  };

  const handleRemovePair = (index: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const buildApiPairs = (): PublishReactionRoleInput['pairs'] => {
    return pairs.map((p) => {
      const emoji = parseEmoji(p.emoji);
      if (!emoji) throw new Error(`Emoji invalide : "${p.emoji}"`);
      if (p.roleMode === 'existing') {
        return { emoji, roleId: p.roleId };
      }
      return { emoji, roleName: p.roleName } as const;
    });
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

        const clientPairs = pairs.map((p) => {
          const emoji = buildClientEmoji(p.emoji);
          const roleId = p.roleMode === 'existing' ? p.roleId : '';
          return {
            emoji: emoji ?? ({ type: 'unicode', value: p.emoji } as const),
            roleId,
          };
        });

        props.onSaved({
          id: result.id,
          label: label.trim(),
          channelId,
          messageId: result.messageId,
          message: message.trim(),
          mode,
          feedback: feedbackChoice,
          pairs: clientPairs,
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

        const clientPairs = pairs.map((p) => {
          const emoji = buildClientEmoji(p.emoji);
          const roleId = p.roleMode === 'existing' ? p.roleId : '';
          return {
            emoji: emoji ?? ({ type: 'unicode', value: p.emoji } as const),
            roleId,
          };
        });

        props.onSaved({
          ...props.existing,
          label: label.trim(),
          channelId,
          messageId: result.messageId ?? props.existing.messageId,
          message: message.trim(),
          mode,
          feedback: feedbackChoice,
          pairs: clientPairs,
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
              <div className="flex flex-wrap gap-4">
                {FEEDBACK_OPTIONS.map((f) => (
                  <label
                    key={f.value}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="radio"
                      name="rr-feedback"
                      value={f.value}
                      checked={feedbackChoice === f.value}
                      onChange={() => setFeedbackChoice(f.value)}
                      className="h-3.5 w-3.5"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="mt-0.5 shrink-0">
                  <InfoIcon />
                </span>
                <span>
                  Discord ne permet pas les messages éphémères en réponse à une réaction — seules
                  les interactions (boutons, slash-commands) y ont accès.
                </span>
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Paires emoji → rôle</CardTitle>
              <CardDescription>
                Colle un emoji unicode ou la forme &lt;:nom:id&gt;. Jusqu'à 20 paires par message.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddPair}
              disabled={pairs.length >= 20}
            >
              + Ajouter
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-border">
              {pairs.map((pair, i) => (
                <PairRow
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
        <DiscordPreview message={message} pairs={pairs} />
      </aside>
    </div>
  );
}
