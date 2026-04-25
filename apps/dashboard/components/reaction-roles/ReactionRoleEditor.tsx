'use client';

import { Button, Select } from '@varde/ui';
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
// Sub-component : éditeur de paires
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
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2">
      {/* Emoji */}
      <div className="relative flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground" htmlFor={`pair-emoji-${index}`}>
          Emoji
        </label>
        <div className="flex items-center gap-1">
          <input
            id={`pair-emoji-${index}`}
            type="text"
            value={pair.emoji}
            placeholder="🌍 ou <:nom:id>"
            maxLength={64}
            onChange={(e) => setEmojiValue(e.target.value)}
            className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Emoji de la paire ${index + 1}`}
          />
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Ouvrir le sélecteur d'emoji"
            aria-expanded={pickerOpen}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-muted"
          >
            😀
          </button>
        </div>
        {pickerOpen ? (
          <EmojiPicker
            catalog={emojis}
            onPick={(raw) => setEmojiValue(raw)}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>

      {/* Mode rôle */}
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground" htmlFor={`pair-rolemode-${index}`}>
          Rôle
        </label>
        <Select
          id={`pair-rolemode-${index}`}
          value={pair.roleMode}
          onChange={(e) => {
            const nextMode = e.target.value as 'existing' | 'create';
            if (nextMode === 'existing') {
              onChange({ uid: pair.uid, emoji: pair.emoji, roleMode: 'existing', roleId: '' });
            } else {
              onChange({ uid: pair.uid, emoji: pair.emoji, roleMode: 'create', roleName: '' });
            }
          }}
          className="h-8 text-xs"
          aria-label={`Mode rôle de la paire ${index + 1}`}
        >
          <option value="existing">Choisir un rôle</option>
          <option value="create">Créer un rôle</option>
        </Select>
      </div>

      {/* Sélecteur / nom de rôle */}
      {pair.roleMode === 'existing' ? (
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground" htmlFor={`pair-roleid-${index}`}>
            Rôle existant
          </label>
          <Select
            id={`pair-roleid-${index}`}
            value={pair.roleId}
            onChange={(e) =>
              onChange({
                uid: pair.uid,
                emoji: pair.emoji,
                roleMode: 'existing',
                roleId: e.target.value,
              })
            }
            className="h-8 text-xs"
            aria-label={`Rôle existant de la paire ${index + 1}`}
          >
            <option value="">— choisir —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground" htmlFor={`pair-rolename-${index}`}>
            Nom du rôle à créer
          </label>
          <input
            id={`pair-rolename-${index}`}
            type="text"
            value={pair.roleName}
            placeholder="Nom du rôle"
            maxLength={100}
            onChange={(e) =>
              onChange({
                uid: pair.uid,
                emoji: pair.emoji,
                roleMode: 'create',
                roleName: e.target.value,
              })
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Nom du rôle à créer pour la paire ${index + 1}`}
          />
        </div>
      )}

      {/* Supprimer */}
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Supprimer la paire ${index + 1}`}
        className="mt-4 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Écran 3 : formulaire de création (mode='new') ou d'édition (mode='edit')
 * d'un message reaction-roles.
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

  // Validation
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

        // Reconstruit le client object depuis les données retournées + state local
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
        // Mode édition
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

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">
          {isNew ? 'Créer un reaction-role' : `Éditer "${props.existing.label}"`}
        </h3>
        <Button type="button" variant="secondary" onClick={props.onCancel}>
          ← Retour
        </Button>
      </div>

      {/* Label */}
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="rr-label">
          Label
        </label>
        <input
          id="rr-label"
          type="text"
          value={label}
          placeholder="Ex. Couleurs de nom"
          maxLength={64}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Salon */}
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="rr-channel">
          Salon de publication
        </label>
        <Select id="rr-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
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

      {/* Message */}
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="rr-message">
          Contenu du message Discord
        </label>
        <textarea
          id="rr-message"
          value={message}
          placeholder="Le texte qui apparaîtra dans le message Discord…"
          maxLength={2000}
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{message.length}/2000</p>
        {!isNew && props.existing.message === '' ? (
          <p className="text-xs text-muted-foreground">
            Le contenu actuel n'est pas connu (entrée créée avant cette mise à jour). Saisis le
            nouveau texte si tu veux le modifier.
          </p>
        ) : null}
      </div>

      {/* Mode */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Mode d'attribution</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              {
                value: 'normal',
                label: 'Normal',
                desc: 'Plusieurs rôles possibles, ajout/retrait libre',
              },
              {
                value: 'unique',
                label: 'Unique',
                desc: 'Un seul rôle à la fois (swap automatique)',
              },
              {
                value: 'verifier',
                label: 'Vérificateur',
                desc: 'Pré-pensé pour la validation des règles',
              },
            ] as const
          ).map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition-colors ${
                mode === m.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="rr-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="sr-only"
              />
              <span className="font-medium">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.desc}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Confirmation utilisateur */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Confirmation à l'utilisateur</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: 'dm',
                label: 'DM (message privé)',
                desc: 'Le bot envoie un MP à chaque ajout / retrait',
              },
              {
                value: 'none',
                label: 'Aucune',
                desc: 'Silencieux',
              },
            ] as const
          ).map((f) => (
            <label
              key={f.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition-colors ${
                feedbackChoice === f.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="rr-feedback"
                value={f.value}
                checked={feedbackChoice === f.value}
                onChange={() => setFeedbackChoice(f.value)}
                className="sr-only"
              />
              <span className="font-medium">{f.label}</span>
              <span className="text-xs text-muted-foreground">{f.desc}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Discord ne permet pas les messages éphémères (« Seul toi peut voir ») en réponse à une
          réaction — seules les interactions (boutons, slash-commands) y ont accès.
        </p>
      </fieldset>

      {/* Paires emoji → rôle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            Paires emoji → rôle{' '}
            <span className="text-xs text-muted-foreground">
              (collez un emoji unicode ou la forme &lt;:nom:id&gt;)
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleAddPair}
            disabled={pairs.length >= 20}
          >
            + Ajouter
          </Button>
        </div>
        <div className="space-y-2">
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
      </div>

      {/* Feedback */}
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

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={props.onCancel}>
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
  );
}
