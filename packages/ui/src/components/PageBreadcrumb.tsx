import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface BreadcrumbItem {
  readonly label: string;
  /**
   * Cible du lien. Omettre pour rendre l'item en texte non-cliquable
   * — typiquement la dernière entrée (page courante) ou un segment
   * intermédiaire qui n'a pas de page hub dédiée (ex. « Paramètres »).
   */
  readonly href?: string;
}

export interface PageBreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
  readonly className?: string;
  /**
   * Composant de lien à utiliser pour les items avec `href`. Permet de
   * brancher `next/link` côté Next.js sans dépendance ici. Par défaut,
   * une `<a>` native — suffisant en SSR sans navigation client.
   */
  readonly LinkComponent?: (props: {
    readonly href: string;
    readonly className: string;
    readonly children: ReactNode;
  }) => ReactElement;
}

const DEFAULT_LINK = ({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className: string;
  readonly children: ReactNode;
}): ReactElement => (
  <a href={href} className={className}>
    {children}
  </a>
);

/**
 * Fil d'Ariane uniformisé pour les pages du dashboard. Chaque item
 * est en majuscules `tracking-wider`, séparé par une flèche `→`. Le
 * dernier item (ou tout item sans `href`) est rendu en texte non
 * cliquable.
 *
 * À utiliser systématiquement dans les headers de page custom au lieu
 * de re-coder le pattern à la main.
 */
export function PageBreadcrumb({
  items,
  className,
  LinkComponent = DEFAULT_LINK,
}: PageBreadcrumbProps): ReactElement {
  return (
    <nav aria-label="Fil d'Ariane" className={cn('text-xs text-muted-foreground', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const labelClass = isLast
          ? 'font-medium uppercase tracking-wider text-foreground'
          : 'font-medium uppercase tracking-wider hover:text-foreground';
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs are static and never reordered
          <span key={`${item.label}-${index}`}>
            {item.href ? (
              <LinkComponent href={item.href} className={labelClass}>
                {item.label}
              </LinkComponent>
            ) : (
              <span className={labelClass}>{item.label}</span>
            )}
            {!isLast ? (
              <span aria-hidden="true" className="mx-2">
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
