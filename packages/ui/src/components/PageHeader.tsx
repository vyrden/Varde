import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export interface PageHeaderProps {
  /** Fil d'Ariane — segments rendus dans l'ordre, dernier segment en gras. */
  readonly breadcrumbs?: readonly BreadcrumbItem[];
  readonly title: string;
  /** Sous-titre optionnel (description courte du module / de la page). */
  readonly description?: string;
  /** Slot d'actions à droite (boutons, indicateur d'état, etc.). */
  readonly actions?: ReactNode;
  /** Sticky par défaut sur les pages longues. */
  readonly sticky?: boolean;
  readonly className?: string;
}

/**
 * En-tête de page uniforme — calque la `c-head` du wireframe shell :
 * fil d'Ariane à 12px muted, titre 22px gras, sous-titre 13px muted,
 * actions à droite. Bordure inférieure pour séparer du body. Sticky
 * en option pour les pages longues à scroller.
 */
export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  sticky = false,
  className,
}: PageHeaderProps): ReactElement {
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-4',
        sticky ? 'sticky top-0 z-10' : '',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Fil d'Ariane" className="mb-1 text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              {breadcrumbs.map((b, i) => {
                const last = i === breadcrumbs.length - 1;
                return (
                  <li key={`${b.label}-${String(i)}`} className="flex items-center gap-1.5">
                    {b.href !== undefined && !last ? (
                      <a
                        href={b.href}
                        className="hover:text-foreground focus:outline-none focus-visible:text-foreground"
                      >
                        {b.label}
                      </a>
                    ) : (
                      <span className={last ? 'font-medium text-foreground' : ''}>{b.label}</span>
                    )}
                    {!last ? <span aria-hidden="true">/</span> : null}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}
        <h1 className="truncate text-[22px] font-bold leading-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
