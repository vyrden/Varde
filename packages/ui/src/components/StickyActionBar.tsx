'use client';

import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';
import { Button } from './Button.js';

/**
 * Barre d'action collante en bas de container — pattern « cancel / save
 * + indicateur dirty ». Affichée en `sticky bottom-0` plutôt que
 * `position: fixed` pour rester contenue dans son parent (et éviter
 * de chevaucher des sidebars d'app fixes).
 *
 * Quand `dirty=true` : strip jaune « Modifications non sauvegardées »
 * + bouton Enregistrer activé. Quand `dirty=false` : strip neutre,
 * boutons désactivés. La barre reste visible pour confirmer à
 * l'admin que sa session est en sync — pattern Discord, GitHub,
 * Notion settings.
 *
 * `pending` : flag de transaction (formulaire en cours de save).
 * Désactive les deux boutons et affiche « Enregistrement… » sur
 * Save. Indépendant de `dirty` (un save en cours sur un état non
 * dirty est un état impossible mais l'API ne l'exclut pas).
 *
 * `description` (optionnel) : remplace le texte par défaut
 * « Modifications non sauvegardées » côté gauche. Utile pour des
 * formulaires plus parlants (« 3 règles modifiées », etc.).
 *
 * `extra` (optionnel) : node injecté à droite avant les boutons —
 * pour un message d'erreur de save par exemple.
 */
export interface StickyActionBarProps {
  readonly dirty: boolean;
  readonly pending?: boolean;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly cancelLabel?: string;
  readonly saveLabel?: string;
  readonly pendingLabel?: string;
  readonly cleanLabel?: string;
  readonly dirtyLabel?: string;
  readonly description?: ReactNode;
  readonly extra?: ReactNode;
  readonly className?: string;
  /**
   * Désactive le bouton Save indépendamment de `dirty` / `pending`.
   * Utilisé quand un prérequis n'est pas rempli (ex. salon de
   * destination manquant). `saveDisabledTitle` est posé en `title`
   * pour expliquer à l'utilisateur pourquoi.
   */
  readonly saveDisabled?: boolean;
  readonly saveDisabledTitle?: string;
}

export function StickyActionBar({
  dirty,
  pending = false,
  onCancel,
  onSave,
  cancelLabel = 'Annuler',
  saveLabel = 'Enregistrer',
  pendingLabel = 'Enregistrement…',
  cleanLabel = 'Aucune modification.',
  dirtyLabel = 'Modifications non sauvegardées.',
  description,
  extra,
  className,
  saveDisabled = false,
  saveDisabledTitle,
}: StickyActionBarProps): ReactElement {
  const message = description ?? (dirty ? dirtyLabel : cleanLabel);
  return (
    <section
      aria-live="polite"
      aria-label="Barre d'enregistrement"
      className={cn(
        'sticky bottom-0 z-20 rounded-b-lg border-t backdrop-blur',
        dirty ? 'border-warning/40 bg-warning/10' : 'border-border bg-card/85',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', dirty ? 'bg-warning' : 'bg-success/60')}
          />
          <p className={cn(dirty ? 'text-foreground' : 'text-muted-foreground')}>{message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={pending || !dirty}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={pending || !dirty || saveDisabled}
            title={saveDisabled ? saveDisabledTitle : undefined}
          >
            {pending ? pendingLabel : saveLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}
