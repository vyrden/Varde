import { forwardRef, type HTMLAttributes, type ReactElement } from 'react';

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
 *
 * Variantes composables (jalon 7 PR 7.4.10) :
 *
 * - `<SkeletonText lines={3} />` : un paragraphe simulé, dernière
 *   ligne raccourcie pour signaler la fin du paragraphe (pattern
 *   Material / shadcn).
 * - `<SkeletonCard />` : preset card (header + 3 lignes corps),
 *   directement utilisable dans un `loading.tsx` ou un grid de
 *   chargement.
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

export interface SkeletonTextProps {
  /** Nombre de lignes du paragraphe simulé. Défaut : 3. */
  readonly lines?: number;
  readonly className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps): ReactElement | null {
  if (lines <= 0) return null;
  // Largeurs variées pour ne pas avoir N rectangles strictement
  // identiques : la dernière ligne raccourcie signale la fin du
  // paragraphe, les autres alternent entre full et 5/6 width.
  const widthClass = (index: number, total: number): string => {
    if (index === total - 1) return 'w-2/3';
    return index % 2 === 0 ? 'w-full' : 'w-5/6';
  };
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: pur placeholder visuel sans identité sémantique, l'index est l'identifiant naturel.
          key={index}
          className={cn('h-3', widthClass(index, lines))}
        />
      ))}
    </div>
  );
}

export interface SkeletonCardProps {
  readonly className?: string;
  /** Nombre de lignes du corps texte. Défaut : 3. */
  readonly bodyLines?: number;
}

export function SkeletonCard({ className, bodyLines = 3 }: SkeletonCardProps): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-md" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={bodyLines} />
    </div>
  );
}
