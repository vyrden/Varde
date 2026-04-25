import { Badge, buttonVariants, EmptyState } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../lib/api-client';
import { moduleIcon } from './shell/module-icons';

export interface ModuleListProps {
  readonly guildId: string;
  readonly modules: readonly ModuleListItemDto[];
}

/**
 * Liste des modules d'une guild — format « integration list » (Vercel,
 * Stripe, Linear). Une ligne par module : icône + nom/description,
 * badge statut et CTA outline à droite. Description et CTA sont
 * toujours visibles.
 *
 * Le `<Link>` enveloppe toute la ligne pour rester cliquable au
 * clavier comme à la souris ; le faux bouton « Configurer » est un
 * `<span>` stylé via `buttonVariants` pour éviter d'imbriquer un
 * `<button>` dans un `<a>` (HTML invalide).
 */
export function ModuleList({ guildId, modules }: ModuleListProps): ReactElement {
  if (modules.length === 0) {
    return (
      <EmptyState
        title="Aucun module chargé"
        description="Le core n'a chargé aucun module pour cette guild. Vérifie la configuration du serveur."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {modules.map((module) => {
        const enabled = module.enabled;
        return (
          <li key={module.id}>
            <Link
              href={`/guilds/${guildId}/modules/${module.id}`}
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                  enabled ? 'bg-primary/15 text-primary' : 'bg-surface-active text-muted-foreground'
                }`}
              >
                {moduleIcon(module.id, 20)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {module.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">v{module.version}</span>
                </div>
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {module.description || 'Aucune description fournie par le manifest.'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Badge variant={enabled ? 'active' : 'inactive'}>
                  {enabled ? 'Actif' : 'Inactif'}
                </Badge>
                <span className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  Configurer
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
