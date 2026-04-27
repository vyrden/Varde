import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

/**
 * Bloc gris animé `pulse` pour les états de chargement. Pas
 * d'animation décorative — `animate-pulse` Tailwind reste sous le
 * seuil DA (200 ms est largement dépassé volontairement, c'est une
 * boucle de feedback de chargement, pas une transition).
 *
 * Utiliser des dimensions explicites (`h-3 w-24`, `h-5 w-32`…) pour
 * matcher la cible visuelle qu'on anticipe ; sinon le squelette
 * collapse en hauteur 0.
 */
export const Skeleton = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn('block animate-pulse rounded bg-surface-active', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
