import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  /** Orientation. `horizontal` est la valeur par défaut. */
  readonly orientation?: 'horizontal' | 'vertical';
  /**
   * Si true, le séparateur est purement décoratif (`role="none"`,
   * pas d'annonce screen reader). Sinon il est annoncé comme
   * séparateur sémantique. `aria-orientation` n'est posé que sur le
   * rôle sémantique non-vertical pour passer la règle a11y de Biome.
   */
  readonly decorative?: boolean;
}

/**
 * Trait fin de séparation, utilisé pour scinder un header de page
 * de son contenu, ou deux blocs adjacents dans une card. S'aligne
 * sur la couleur de border du theme.
 */
export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => {
    const semanticProps = decorative
      ? { role: 'none' as const }
      : {
          role: 'separator' as const,
          'aria-orientation': orientation,
        };
    return (
      <div
        ref={ref}
        {...semanticProps}
        className={cn(
          'shrink-0 bg-border',
          orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
          className,
        )}
        {...props}
      />
    );
  },
);
Separator.displayName = 'Separator';
