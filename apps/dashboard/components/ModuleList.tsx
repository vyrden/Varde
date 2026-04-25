import { Badge, EmptyState } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../lib/api-client';

export interface ModuleListProps {
  readonly guildId: string;
  readonly modules: readonly ModuleListItemDto[];
}

/**
 * Liste des modules d'une guild en grille de cards Discord-style.
 * Chaque card a un hover subtil (border blurple + élévation) qui
 * répond rapidement façon Discord. Pas d'animation décorative —
 * juste un retour visuel propre.
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
    <ul className="grid gap-3 sm:grid-cols-2">
      {modules.map((module) => (
        <li key={module.id}>
          <Link
            href={`/guilds/${guildId}/modules/${module.id}`}
            className="group flex h-full flex-col gap-2 rounded-lg border border-transparent bg-card p-4 transition-all duration-150 ease-out hover:border-primary hover:bg-surface-hover hover:shadow-lg focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-foreground">
                  {module.name}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">v{module.version}</p>
              </div>
              <Badge variant={module.enabled ? 'active' : 'inactive'}>
                {module.enabled ? 'Actif' : 'Inactif'}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {module.description || 'Aucune description fournie par le manifest.'}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
