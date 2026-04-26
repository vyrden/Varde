import { Badge, buttonVariants, EmptyState } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../lib/api-client';
import { ModuleEnabledToggle } from './ModuleEnabledToggle';
import { moduleIcon } from './shell/module-icons';

export interface ModuleListProps {
  readonly guildId: string;
  readonly modules: readonly ModuleListItemDto[];
}

/** Modules considérés comme « système » — pas pilotables par l'admin. */
const SYSTEM_MODULE_IDS = new Set(['hello-world']);

/**
 * Hub des modules — grille de cards façon « product tile » (icône
 * teintée, nom + version + badge état, description, séparateur,
 * CTA Configurer plein largeur).
 *
 * Le toggle d'activation est posé en absolute top-right de la card,
 * en dehors du `<Link>` qui enveloppe le reste — on ne peut pas
 * imbriquer un `<button>` interactif dans un `<a>` (HTML invalide,
 * et le clic propagerait à la navigation). Pour les modules système
 * (Hello World), pas de toggle, juste un badge dédié violet.
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
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {modules.map((module) => {
        const enabled = module.enabled;
        const isSystem = SYSTEM_MODULE_IDS.has(module.id);
        return (
          <li key={module.id} className="relative">
            {/* Toggle hors du <Link> — interactivité dédiée, pas de
                propagation au clic, HTML valide. */}
            {!isSystem ? (
              <div className="absolute top-3 right-3 z-10">
                <ModuleEnabledToggle
                  guildId={guildId}
                  moduleId={module.id}
                  moduleName={module.name}
                  initialEnabled={enabled}
                />
              </div>
            ) : null}
            <Link
              href={`/guilds/${guildId}/modules/${module.id}`}
              className={`group flex h-full flex-col rounded-lg border bg-card transition-all duration-150 ease-out hover:border-primary/60 hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                enabled ? 'border-border' : 'border-border bg-card/60'
              }`}
            >
              <div className="space-y-3 p-4">
                <div className="flex items-start gap-3 pr-12">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                      enabled
                        ? 'bg-primary/15 text-primary'
                        : 'bg-surface-active text-muted-foreground opacity-60'
                    }`}
                  >
                    {moduleIcon(module.id, 20)}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {module.name}
                      </span>
                      {isSystem ? <Badge variant="system">Système</Badge> : null}
                    </div>
                    <span className="inline-block rounded-sm bg-input px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      v{module.version}
                    </span>
                  </div>
                </div>

                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {module.description || 'Aucune description fournie par le manifest.'}
                </p>
              </div>

              <div className="mt-auto border-t border-border p-3">
                <span
                  className={`${buttonVariants({ variant: 'outline', size: 'sm' })} w-full justify-center transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground`}
                >
                  Configurer →
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
