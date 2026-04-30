'use client';

import type { ChangeEvent, ReactElement } from 'react';
import { useId, useMemo, useState } from 'react';

/**
 * Multi-select de rôles Discord (jalon 7 PR 7.3 sub-livrable 7).
 *
 * Affichage :
 *
 * - Chaque rôle est rendu avec une pastille couleur (couleur Discord
 *   convertie en hex, ou fallback gris quand `color` est `0` ou
 *   absent — Discord 0 = pas de couleur custom).
 * - Tri par hiérarchie : `position` décroissant (le rôle le plus
 *   haut en premier). En cas d'égalité, alphabétique sur `name`.
 *   `@everyone` est filtré côté API (`listGuildRoles` exclut), pas
 *   besoin de le faire ici.
 * - Recherche par nom (case-insensitive). Le filtre se fait
 *   côté client uniquement — toutes les options sont en mémoire.
 *
 * Layout simple (pas de popover/combobox lourd) : champ recherche
 * + liste scrollable de checkboxes. Suffisant pour < ~50 rôles
 * (cas d'usage Discord typique). Au-delà on virtualiserait, mais
 * pas pour V1.
 *
 * Tag « non-éditable » (cf. spec) : un rôle peut être marqué
 * `disabled: true` via `disabledRoleIds` — affiché grisé, sans
 * checkbox cliquable. Cas d'usage : un rôle géré par une
 * intégration Discord externe (rôles `managed` côté discord.js)
 * ou — V2 — l'indicateur « Owner ».
 */

export interface RoleOption {
  readonly id: string;
  readonly name: string;
  readonly color?: number;
  readonly position?: number;
  readonly memberCount?: number;
}

export interface RoleMultiSelectCopy {
  readonly searchPlaceholder: string;
  readonly empty: string;
  readonly memberCountLabel: (count: number) => string;
  readonly disabledLabel: string;
}

export interface RoleMultiSelectProps {
  readonly roles: readonly RoleOption[];
  readonly selected: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly copy: RoleMultiSelectCopy;
  readonly disabledRoleIds?: readonly string[];
  readonly ariaLabel?: string;
  readonly testIdPrefix?: string;
}

const colorToCss = (color: number | undefined): string => {
  if (color === undefined || color === 0) return 'rgb(148 163 184)'; // slate-400 fallback
  return `#${color.toString(16).padStart(6, '0')}`;
};

const sortRoles = (roles: readonly RoleOption[]): readonly RoleOption[] =>
  [...roles].sort((a, b) => {
    const ap = a.position ?? 0;
    const bp = b.position ?? 0;
    if (ap !== bp) return bp - ap;
    return a.name.localeCompare(b.name);
  });

export function RoleMultiSelect({
  roles,
  selected,
  onChange,
  copy,
  disabledRoleIds,
  ariaLabel,
  testIdPrefix = 'role-multiselect',
}: RoleMultiSelectProps): ReactElement {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const disabledSet = useMemo(() => new Set(disabledRoleIds ?? []), [disabledRoleIds]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const sorted = useMemo(() => sortRoles(roles), [roles]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return sorted;
    return sorted.filter((r) => r.name.toLowerCase().includes(q));
  }, [sorted, query]);

  const toggle = (roleId: string): void => {
    if (disabledSet.has(roleId)) return;
    if (selectedSet.has(roleId)) {
      onChange(selected.filter((id) => id !== roleId));
    } else {
      onChange([...selected, roleId]);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={searchId} className="sr-only">
          {copy.searchPlaceholder}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder={copy.searchPlaceholder}
          data-testid={`${testIdPrefix}-search`}
          className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <fieldset
        className="max-h-70 overflow-y-auto rounded-md border border-border-muted bg-background"
        data-testid={`${testIdPrefix}-list`}
      >
        {ariaLabel !== undefined ? <legend className="sr-only">{ariaLabel}</legend> : null}
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <ul className="divide-y divide-border-muted">
            {filtered.map((role) => {
              const isSelected = selectedSet.has(role.id);
              const isDisabled = disabledSet.has(role.id);
              return (
                <li key={role.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ${
                      isDisabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggle(role.id)}
                      data-testid={`${testIdPrefix}-checkbox-${role.id}`}
                      className="size-4 rounded border-border-muted text-primary focus:ring-2 focus:ring-ring"
                    />
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full border border-border-muted"
                      style={{ backgroundColor: colorToCss(role.color) }}
                    />
                    <span className="flex-1 truncate font-medium text-foreground">{role.name}</span>
                    {role.memberCount !== undefined ? (
                      <span className="text-xs text-muted-foreground">
                        {copy.memberCountLabel(role.memberCount)}
                      </span>
                    ) : null}
                    {isDisabled ? (
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {copy.disabledLabel}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
