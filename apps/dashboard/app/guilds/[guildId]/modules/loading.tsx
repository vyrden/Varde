import { Skeleton, SkeletonCard } from '@varde/ui';
import type { ReactElement } from 'react';

/**
 * Skeleton de la grille de modules (jalon 7 PR 7.4.10). Reproduit
 * la silhouette du contenu réel : header titre + barre de filtres,
 * puis 6 cards modules en grille responsive.
 *
 * 6 placeholders couvrent visuellement le viewport sur 2/3 colonnes
 * sans clignoter de placeholder vide ; au-delà la page réelle aura
 * toujours pris le relais.
 */
export default function LoadingModulesGrid(): ReactElement {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <header className="mb-6 flex flex-col gap-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-80" />
      </header>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-md" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonCard
            // biome-ignore lint/suspicious/noArrayIndexKey: pur placeholder visuel sans identité sémantique, l'index est l'identifiant naturel.
            key={index}
            bodyLines={2}
          />
        ))}
      </div>
    </div>
  );
}
