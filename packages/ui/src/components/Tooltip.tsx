import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface TooltipProps {
  /** Contenu textuel — affichage compact, pas de markdown. */
  readonly text: string;
  /** Côté de l'ancrage. Défaut « top ». */
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  /** Élément déclencheur (bouton, lien, icône…). */
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Tooltip CSS-only façon Discord : fond `--rail` (le plus sombre),
 * texte foreground, petite flèche pointant vers l'ancre, fade-in
 * en 120 ms à `:hover`/`:focus-within` du wrapper.
 *
 * Implémentation sans JS ni portal : suffit pour les cas usuels
 * (icônes du rail, items sidebar, boutons d'actions). Si un tooltip
 * devait sortir du flow (popup au-dessus d'un overflow:hidden),
 * il faudra envisager `@floating-ui/react` — non en V1.
 */
export function Tooltip({ text, side = 'top', children, className }: TooltipProps): ReactElement {
  const positions: Readonly<Record<NonNullable<TooltipProps['side']>, string>> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };
  const arrows: Readonly<Record<NonNullable<TooltipProps['side']>, string>> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-rail border-x-transparent border-b-transparent',
    bottom:
      'bottom-full left-1/2 -translate-x-1/2 border-b-rail border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-rail border-y-transparent border-r-transparent',
    right:
      'right-full top-1/2 -translate-y-1/2 border-r-rail border-y-transparent border-l-transparent',
  };

  return (
    // `<div>` plutôt que `<span>` — un span ne peut pas contenir de
    // contenu de type block (ex. `<form>` pour les server actions du
    // rail). Le parser HTML auto-fermait le span avant le form, ce qui
    // cassait le contexte `relative` et la détection de hover.
    <div className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none invisible absolute z-50 whitespace-nowrap rounded bg-rail px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-lg',
          'transition-opacity duration-150 ease-out',
          'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
          positions[side],
        )}
      >
        {text}
        <span aria-hidden="true" className={cn('absolute h-0 w-0 border-4', arrows[side])} />
      </span>
    </div>
  );
}
