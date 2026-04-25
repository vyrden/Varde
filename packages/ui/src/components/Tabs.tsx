import type { ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface TabsListProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Conteneur des onglets — barre horizontale avec border-bottom.
 * Pattern Discord (settings serveur, navigation app) : aucun fond
 * quand inactif, bordure inférieure blurple quand actif.
 */
export function TabsList({ ariaLabel, children, className }: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-1 border-b-2 border-border', className)}
    >
      {children}
    </div>
  );
}

export interface TabProps {
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Onglet individuel. `active` contrôlé par le parent (state lifting).
 * Le `-mb-[2px]` aligne la bordure inférieure de l'onglet actif sur
 * celle du conteneur — pas de saut visuel.
 */
export function Tab({ active, onSelect, children, className }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        '-mb-[2px] flex items-center gap-2 px-4 py-2 text-sm font-medium',
        'border-b-2 transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}
