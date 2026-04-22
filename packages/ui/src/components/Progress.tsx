import type { HTMLAttributes, ReactElement } from 'react';

import { cn } from '../lib/cn.js';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Valeur affichée, 0..max. Clampée au sein du composant. */
  readonly value: number;
  /** Borne haute. Défaut : 100. */
  readonly max?: number;
  /** Libellé accessible de la barre. Défaut : `progression`. */
  readonly label?: string;
}

/**
 * Barre de progression minimaliste. Expose `role="progressbar"` et
 * les attributs ARIA (`aria-valuenow`, `aria-valuemin`, `aria-valuemax`)
 * pour rester utilisable au clavier / lecteur d'écran — pas de
 * dépendance Radix, on garde le DS léger.
 */
export function Progress({
  className,
  value,
  max = 100,
  label = 'progression',
  ...props
}: ProgressProps): ReactElement {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(safeMax, value));
  const ratio = clamped / safeMax;
  const percent = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
