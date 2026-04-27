import { PageBreadcrumb as BasePageBreadcrumb, type BreadcrumbItem } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

export type { BreadcrumbItem };

/** Wrapper Next.js — utilise `next/link` pour la navigation client-side. */
function NextLinkAdapter({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * Fil d'Ariane des pages dashboard. Pré-applique `next/link` comme
 * adapter et l'espacement bas standard (`mb-3`) pour homogénéiser le
 * pattern à travers les 9 pages dashboard.
 */
export function PageBreadcrumb({
  items,
}: {
  readonly items: readonly BreadcrumbItem[];
}): ReactElement {
  return <BasePageBreadcrumb items={items} className="mb-3" LinkComponent={NextLinkAdapter} />;
}
