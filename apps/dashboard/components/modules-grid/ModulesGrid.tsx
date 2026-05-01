'use client';

import { useToast } from '@varde/ui';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo, useState } from 'react';

import type { ModuleListItemDto } from '../../lib/api-client';
import { filterModules, type ModuleFilterStatus } from '../../lib/filter-modules';
import { useDebounced } from '../../lib/use-debounced';
import { FilterBar } from './FilterBar';
import { ModuleCard } from './ModuleCard';

/**
 * Grille de modules client (jalon 7 PR 7.4.7). Orchestre :
 * - état recherche + filtre statut (Tous/Actifs/Inactifs),
 * - debounce recherche 200 ms (cf. spec §9, latence < 100 ms ressentie),
 * - filtrage local en O(N) via `filter-modules.ts`,
 * - empty states (aucun module, aucun résultat de filtre),
 * - toast d'erreur quand la limite de 8 épingles est dépassée.
 *
 * Le filtrage est local parce que la liste tient en quelques dizaines
 * d'entrées au plus — pas de cas où une recherche serveur serait
 * justifiée.
 */

export interface ModulesGridProps {
  readonly guildId: string;
  readonly modules: readonly ModuleListItemDto[];
}

export function ModulesGrid({ guildId, modules }: ModulesGridProps): ReactElement {
  const t = useTranslations('modulesGrid');
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ModuleFilterStatus>('all');
  const debouncedQuery = useDebounced(query, 200);

  const filtered = useMemo(
    () => filterModules(modules, debouncedQuery, status),
    [modules, debouncedQuery, status],
  );

  const onPinError = (code: string, message: string): void => {
    if (code === 'invalid_pins') {
      toast({
        title: t('toast.maxPinsTitle'),
        description: t('toast.maxPinsDescription'),
        kind: 'warning',
      });
      return;
    }
    toast({ title: t('toast.pinErrorTitle'), description: message, kind: 'error' });
  };

  return (
    <div className="space-y-5">
      <FilterBar
        query={query}
        status={status}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
      />
      {modules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          {t('emptyAll')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          {t('emptyFiltered', { query: debouncedQuery })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((module) => (
            <ModuleCard key={module.id} guildId={guildId} module={module} onPinError={onPinError} />
          ))}
        </div>
      )}
    </div>
  );
}
