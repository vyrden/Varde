import { Badge, EmptyState } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../lib/api-client';
import { moduleIcon } from './shell/module-icons';

export interface ModuleListProps {
  readonly guildId: string;
  readonly modules: readonly ModuleListItemDto[];
}

/**
 * Liste des modules d'une guild — design inspiré des cards Discord
 * Nitro (discord.com/store) :
 *
 * - Card avec asset visuel centré sur fond `--card`.
 * - Pill/badge d'état en absolu top-left.
 * - Titre + version visible par défaut.
 * - Description masquée par défaut, révélée au hover (transition
 *   `max-height` 0 → 5rem + opacity 0 → 1).
 * - CTA « Configurer → » qui apparaît du bas (translate-y + opacity)
 *   au hover.
 * - Card scale 1.02 + ombre + border blurple au hover. Le bezier
 *   custom (0.36, 0.35, 0.1, 1.23) reproduit le ressort Discord.
 *
 * Le wrapper externe est un `<Link>` pour que toute la card soit
 * cliquable (clavier + souris).
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
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((module) => {
        const enabled = module.enabled;
        return (
          <li key={module.id}>
            <Link
              href={`/guilds/${guildId}/modules/${module.id}`}
              className="group relative block h-72 overflow-hidden rounded-2xl bg-card p-5 ring-1 ring-white/5 transition-[transform,box-shadow,background-color] duration-400 ease-[cubic-bezier(0.36,0.35,0.1,1.23)] hover:bg-surface-hover hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.35)] hover:ring-white/10 focus-visible:bg-surface-hover focus-visible:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:transform-[scale(1.02)]"
            >
              <Badge
                variant={enabled ? 'active' : 'inactive'}
                className="absolute left-4 top-4 z-10"
              >
                {enabled ? 'Actif' : 'Inactif'}
              </Badge>

              {/* Asset : icône module agrandie, centrée, teintée selon l'état */}
              <div className="flex h-32 items-center justify-center">
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded-2xl transition-transform duration-400 ease-[cubic-bezier(0.36,0.35,0.1,1.23)] group-hover:transform-[scale(1.08)] ${
                    enabled
                      ? 'bg-primary/15 text-primary'
                      : 'bg-surface-active text-muted-foreground'
                  }`}
                >
                  {moduleIcon(module.id, 36)}
                </div>
              </div>

              {/* Bloc texte */}
              <div className="flex flex-1 flex-col">
                <p className="text-xs text-muted-foreground">v{module.version}</p>
                <h3 className="mt-0.5 text-lg font-semibold leading-tight text-foreground">
                  {module.name}
                </h3>
                <p className="mt-1 max-h-0 overflow-hidden text-sm leading-relaxed text-muted-foreground opacity-0 transition-[max-height,opacity] duration-400 ease-[cubic-bezier(0.36,0.35,0.1,1.23)] group-hover:max-h-20 group-hover:opacity-100 group-focus-visible:max-h-20 group-focus-visible:opacity-100">
                  {module.description || 'Aucune description fournie par le manifest.'}
                </p>
              </div>

              {/* CTA — apparaît au hover */}
              <div className="absolute inset-x-5 bottom-5 translate-y-2 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                <span className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground">
                  Configurer
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M5 3l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
