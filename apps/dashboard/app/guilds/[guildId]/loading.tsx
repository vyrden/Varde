import { Skeleton, SkeletonCard } from '@varde/ui';
import type { ReactElement } from 'react';

/**
 * Skeleton de la vue d'ensemble guild (jalon 7 PR 7.4.10). Affiché
 * pendant le chargement server-side initial de la page (Next.js
 * lit ce fichier automatiquement comme route segment loading).
 *
 * Reproduit la silhouette du contenu réel pour minimiser le saut
 * visuel au remplacement : hero (icône + titre + métadonnée +
 * badge statut), puis grille 3 cards correspondant aux blocs
 * « Modules épinglés », « Modifié récemment », « Activité 24 h ».
 */
export default function LoadingGuildOverview(): ReactElement {
  return (
    <>
      <header className="flex flex-col gap-4 border-b border-border bg-surface px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 shrink-0 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-9 w-64 rounded-md" />
      </header>
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SkeletonCard bodyLines={3} />
          <SkeletonCard bodyLines={3} />
          <SkeletonCard bodyLines={3} />
        </div>
      </div>
    </>
  );
}
