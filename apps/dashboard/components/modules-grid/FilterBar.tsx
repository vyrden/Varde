'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import type { ModuleFilterStatus } from '../../lib/filter-modules';

/**
 * Barre de filtres de la grille de modules (jalon 7 PR 7.4.7).
 * Recherche full-text contrôlée par le parent (debounce géré
 * dans `ModulesGrid` via `useDebounced`) + segmented control
 * Tous / Actifs / Inactifs.
 *
 * Composant pur — toute la logique de filtre vit dans
 * `lib/filter-modules.ts`. Ici on émet les events au parent.
 */

const STATUS_OPTIONS: readonly ModuleFilterStatus[] = ['all', 'active', 'inactive'];

export interface FilterBarProps {
  readonly query: string;
  readonly status: ModuleFilterStatus;
  readonly onQueryChange: (value: string) => void;
  readonly onStatusChange: (status: ModuleFilterStatus) => void;
}

export function FilterBar({
  query,
  status,
  onQueryChange,
  onStatusChange,
}: FilterBarProps): ReactElement {
  const t = useTranslations('modulesGrid.filterBar');

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative flex-1 sm:max-w-md">
        <span className="sr-only">{t('searchLabel')}</span>
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-md border border-border bg-bg-surface-1 py-2 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <fieldset
        aria-label={t('statusLabel')}
        className="inline-flex items-center rounded-md border border-border bg-bg-surface-1 p-0.5"
      >
        <legend className="sr-only">{t('statusLabel')}</legend>
        {STATUS_OPTIONS.map((option) => {
          const active = option === status;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onStatusChange(option)}
              aria-pressed={active}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? 'bg-bg-surface-3 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`status.${option}`)}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
