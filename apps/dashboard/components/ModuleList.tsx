'use client';

import { Badge, buttonVariants, EmptyState, Input } from '@varde/ui';
import Link from 'next/link';
import { type ReactElement, useMemo, useState } from 'react';

import type { ModuleListItemDto } from '../lib/api-client';
import { ModuleEnabledToggle } from './ModuleEnabledToggle';
import { moduleIcon } from './shell/module-icons';

export interface ModuleListProps {
  readonly guildId: string;
  readonly modules: readonly ModuleListItemDto[];
}

/** Modules considérés comme « système » — pas pilotables par l'admin. */
const SYSTEM_MODULE_IDS = new Set(['hello-world']);

type StatusFilter = 'all' | 'enabled' | 'disabled';

/**
 * Hub des modules — grille de cards façon « product tile » (icône
 * teintée, nom + version + badge état, description, séparateur,
 * CTA Configurer plein largeur).
 *
 * Une barre filtre/recherche en tête couvre les cas où le catalogue
 * grossit (recherche par nom/description/id, segment Tous/Actifs/Inactifs).
 * État local au composant — pas d'URL persistance V1, le hub n'est
 * pas lié à un workflow où la position importerait au refresh.
 *
 * Le toggle d'activation est posé en absolute top-right de la card,
 * en dehors du `<Link>` qui enveloppe le reste — on ne peut pas
 * imbriquer un `<button>` interactif dans un `<a>` (HTML invalide,
 * et le clic propagerait à la navigation). Pour les modules système
 * (Hello World), pas de toggle, juste un badge dédié violet.
 */
export function ModuleList({ guildId, modules }: ModuleListProps): ReactElement {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modules.filter((m) => {
      if (status === 'enabled' && !m.enabled) return false;
      if (status === 'disabled' && m.enabled) return false;
      if (q.length === 0) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    });
  }, [modules, query, status]);

  if (modules.length === 0) {
    return (
      <EmptyState
        title="Aucun module chargé"
        description="Le core n'a chargé aucun module pour cette guild. Vérifie la configuration du serveur."
      />
    );
  }

  const enabledCount = modules.filter((m) => m.enabled).length;
  const disabledCount = modules.length - enabledCount;

  return (
    <div className="flex flex-col gap-4">
      <ModulesFilterBar
        query={query}
        onQueryChange={setQuery}
        status={status}
        onStatusChange={setStatus}
        counts={{ all: modules.length, enabled: enabledCount, disabled: disabledCount }}
        visible={filtered.length}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun module ne correspond"
          description="Aucun module ne correspond à votre recherche ou au filtre actuel."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((module) => {
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
                  className={`group interactive-lift flex h-full flex-col rounded-lg border bg-card shadow-sm hover:border-primary/60 hover:shadow-glow-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
      )}
    </div>
  );
}

interface ModulesFilterBarProps {
  readonly query: string;
  readonly onQueryChange: (next: string) => void;
  readonly status: StatusFilter;
  readonly onStatusChange: (next: StatusFilter) => void;
  readonly counts: { readonly all: number; readonly enabled: number; readonly disabled: number };
  readonly visible: number;
}

function ModulesFilterBar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  counts,
  visible,
}: ModulesFilterBarProps): ReactElement {
  const SEGMENTS: ReadonlyArray<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: 'Tous', count: counts.all },
    { key: 'enabled', label: 'Actifs', count: counts.enabled },
    { key: 'disabled', label: 'Inactifs', count: counts.disabled },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="relative min-w-56 flex-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10.5 10.5L13 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <Input
          type="search"
          aria-label="Rechercher un module"
          placeholder="Rechercher (nom, identifiant, description)…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div
        role="tablist"
        aria-label="Filtrer par statut"
        className="inline-flex items-center gap-0.5 rounded-md border border-border bg-input p-0.5"
      >
        {SEGMENTS.map((seg) => {
          const active = status === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(seg.key)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-surface-active text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {seg.label}
              <span
                className={`rounded-sm px-1 font-mono text-[10px] ${
                  active ? 'bg-rail text-foreground' : 'text-muted-foreground'
                }`}
              >
                {seg.count}
              </span>
            </button>
          );
        })}
      </div>

      {(query.length > 0 || status !== 'all') && visible !== counts.all ? (
        <span className="text-xs text-muted-foreground">
          {visible} affiché{visible > 1 ? 's' : ''}
        </span>
      ) : null}
    </div>
  );
}
