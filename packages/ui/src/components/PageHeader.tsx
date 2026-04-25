import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

/** Conservé pour rétrocompat : les pages passent encore breadcrumbs. */
interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export interface PageHeaderProps {
  /**
   * Fil d'Ariane — accepté en prop pour rétrocompat mais non rendu en
   * V2 du shell : la sidebar Discord-style indique déjà le contexte
   * de navigation (guild → section → page). Le seul cas où on
   * matérialise quelque chose, c'est le label de section juste au-dessus
   * du titre, en avant-dernière position du tableau.
   */
  readonly breadcrumbs?: readonly BreadcrumbItem[];
  readonly title: string;
  /** Sous-titre optionnel (description courte du module / de la page). */
  readonly description?: string;
  /** Slot d'actions à droite (boutons, indicateur d'état, etc.). */
  readonly actions?: ReactNode;
  /** Sticky en haut au scroll. */
  readonly sticky?: boolean;
  readonly className?: string;
}

/**
 * En-tête de page uniforme. Calqué sur Discord Settings : eyebrow
 * (label de section) en 11px uppercase, titre 22px gras, description
 * 13px muted, actions à droite. Pas de fil d'Ariane — la sidebar
 * (composant `GuildSidebar` du shell) sert de fil contextuel.
 */
export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  sticky = false,
  className,
}: PageHeaderProps): ReactElement {
  // Eyebrow : avant-dernier segment du tableau, qui correspond
  // typiquement à la section parente (« Modules », « Paramètres »…).
  const eyebrow =
    breadcrumbs && breadcrumbs.length >= 2 ? breadcrumbs[breadcrumbs.length - 2]?.label : undefined;

  return (
    <header
      className={cn(
        'flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5',
        sticky ? 'sticky top-0 z-10' : '',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow !== undefined ? (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="truncate text-[22px] font-bold leading-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
