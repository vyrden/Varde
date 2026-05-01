import type { ModuleListItemDto } from './api-client';

/**
 * Filtre statut côté grille de modules (jalon 7 PR 7.4.7) :
 * `'all'` montre tout, `'active'` ne garde que les modules
 * `enabled === true`, `'inactive'` ne garde que les autres.
 */
export type ModuleFilterStatus = 'all' | 'active' | 'inactive';

const matchesQuery = (module: ModuleListItemDto, normalizedQuery: string): boolean => {
  if (normalizedQuery.length === 0) return true;
  const haystacks = [module.id, module.name, module.shortDescription ?? '', module.description];
  for (const h of haystacks) {
    if (h.toLowerCase().includes(normalizedQuery)) return true;
  }
  return false;
};

const matchesStatus = (module: ModuleListItemDto, status: ModuleFilterStatus): boolean => {
  if (status === 'all') return true;
  if (status === 'active') return module.enabled;
  return !module.enabled;
};

/**
 * Filtre la grille de modules par recherche full-text (id, nom,
 * shortDescription, description) et statut (tous / actifs / inactifs).
 *
 * Pure : ne mute jamais l'entrée. Préserve l'ordre. Recherche
 * insensible à la casse, espaces autour de la query trimés.
 */
export function filterModules(
  modules: readonly ModuleListItemDto[],
  query: string,
  status: ModuleFilterStatus,
): readonly ModuleListItemDto[] {
  const normalizedQuery = query.trim().toLowerCase();
  return modules.filter((m) => matchesStatus(m, status) && matchesQuery(m, normalizedQuery));
}
