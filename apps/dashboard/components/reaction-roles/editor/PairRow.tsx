'use client';

import { Button, Input, Label, Select } from '@varde/ui';
import { type ReactElement, type ReactNode, useState } from 'react';

import { EmojiPicker } from '../EmojiPicker';
import type { EmojiCatalog, ReactionRoleButtonStyleClient, RoleOption } from '../types';
import { isPairValid, parseEmoji } from './editor-helpers';
import type { PairDraft } from './editor-types';

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

function TrashIcon(): ReactElement {
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

export interface PairRowProps {
  readonly pair: PairDraft;
  readonly index: number;
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  readonly canRemove: boolean;
  readonly onChange: (updated: PairDraft) => void;
  readonly onRemove: () => void;
  /**
   * Indique que la rangée Discord change après cet élément. Utilisé
   * par le parent pour insérer un séparateur visuel toutes les 5 cases
   * de boutons (= 1 action row Discord).
   */
  readonly afterRowMarker?: ReactNode;
  /**
   * Slot drag-handle injecté par le parent (dnd-kit). Si `null`,
   * affiche un placeholder visuel non interactif.
   */
  readonly dragHandle?: ReactNode;
}

/**
 * Éditeur d'une paire (réaction OU bouton). Affiche un bandeau d'erreur
 * inline si la paire est invalide (emoji manquant ou rôle non choisi).
 *
 * Layout :
 * - Header : drag-handle + badge type + bouton supprimer
 * - Ligne 1 : input emoji + picker bouton + select rôle (existing /
 *   create) + nom rôle si create
 * - Ligne 2 (boutons uniquement) : label + 4 swatchs couleur
 */
export function PairRow({
  pair,
  index,
  roles,
  emojis,
  canRemove,
  onChange,
  onRemove,
  dragHandle,
}: PairRowProps): ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateEmoji = (value: string): void => {
    onChange({ ...pair, emoji: value });
  };

  const updateRoleMode = (next: 'existing' | 'create'): void => {
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
  const isValid = isPairValid(pair);
  const emojiInvalid = parseEmoji(pair.emoji) === null;
  const roleInvalid =
    (pair.roleMode === 'existing' && pair.roleId.length === 0) ||
    (pair.roleMode === 'create' && pair.roleName.trim().length === 0);

  const baseRingClass = !isValid
    ? 'ring-2 ring-destructive/40 bg-destructive/[0.03]'
    : isButton
      ? 'ring-1 ring-primary/30 bg-primary/[0.03]'
      : 'ring-1 ring-border bg-card';

  return (
    <div className={`relative flex flex-col gap-3 rounded-lg p-3 ${baseRingClass}`}>
      <div className="flex items-center gap-2">
        {dragHandle ?? (
          <span
            aria-hidden="true"
            className="flex size-5 items-center justify-center text-muted-foreground/30"
          >
            ⋮⋮
          </span>
        )}
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
        <div className="relative flex items-center gap-1">
          <Input
            id={`elt-emoji-${index}`}
            type="text"
            value={pair.emoji}
            placeholder="😀"
            maxLength={64}
            onChange={(e) => updateEmoji(e.target.value)}
            className={`h-9 w-20 text-center text-lg ${emojiInvalid ? 'border-destructive' : ''}`}
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
              className="min-w-40 flex-1"
              aria-label={`Nom du rôle à créer pour l'élément ${index + 1}`}
            />
          )}
        </div>
      </div>

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

      {!isValid ? (
        <p role="alert" className="text-xs text-destructive">
          {emojiInvalid && roleInvalid
            ? 'Emoji et rôle requis pour publier cet élément.'
            : emojiInvalid
              ? 'Emoji manquant.'
              : 'Rôle requis (sélectionne un existant ou nomme-en un à créer).'}
        </p>
      ) : null}
    </div>
  );
}
