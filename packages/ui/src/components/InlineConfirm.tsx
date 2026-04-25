'use client';

import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';
import { Button } from './Button.js';

export interface InlineConfirmProps {
  /** Texte principal — décrit l'action et son irréversibilité. */
  readonly message: ReactNode;
  /** Libellé du bouton de confirmation (par défaut « Confirmer »). */
  readonly confirmLabel?: string;
  /** Libellé du bouton d'annulation (par défaut « Annuler »). */
  readonly cancelLabel?: string;
  /** Variante du bouton de confirmation (destructive par défaut). */
  readonly confirmVariant?: 'default' | 'destructive';
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly pending?: boolean;
  readonly className?: string;
}

/**
 * Confirmation inline pour les actions destructrices (suppression,
 * kick, purge…). Remplace `confirm()` natif (banni par DA.md). À
 * monter dans le flux de la page après que l'utilisateur ait cliqué
 * sur l'action — le parent gère le state ouvert/fermé.
 */
export function InlineConfirm({
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmVariant = 'destructive',
  onConfirm,
  onCancel,
  pending = false,
  className,
}: InlineConfirmProps): ReactElement {
  return (
    <div
      role="alertdialog"
      aria-modal="false"
      className={cn(
        'flex flex-col gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4',
        className,
      )}
    >
      <div className="flex gap-3">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            role="img"
            aria-label="Avertissement"
          >
            <path
              d="M9 2l8 14H1L9 2zM9 7v4M9 13h.01"
              stroke="var(--destructive)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="flex-1 text-sm text-foreground">{message}</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={confirmVariant}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? '…' : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
