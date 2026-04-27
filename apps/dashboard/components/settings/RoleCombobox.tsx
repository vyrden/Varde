'use client';

import { Input } from '@varde/ui';
import { useEffect, useRef, useState } from 'react';

import type { GuildRoleDto } from '../../lib/api-client';
import { roleColorHex } from './role-colors';

export interface RoleComboboxProps {
  readonly roles: readonly GuildRoleDto[];
  readonly excludeIds: readonly string[];
  readonly onSelect: (roleId: string) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly id?: string;
  readonly ariaLabel?: string;
}

/**
 * Combobox filtrable pour ajouter un rôle. Remplace le `<select>`
 * natif : input texte, pastille couleur sur chaque option, sélection
 * directe au clic (plus de bouton « Lier ») et fermeture automatique
 * du dropdown. Filtre case-insensitive sur le nom du rôle.
 *
 * La couleur de la pastille est dérivée de l'ID du rôle (hash
 * déterministe) — le DTO actuel ne porte pas la vraie couleur Discord
 * du rôle, mais chaque rôle conserve une couleur stable visible.
 */
export function RoleCombobox({
  roles,
  excludeIds,
  onSelect,
  disabled = false,
  placeholder = 'Rechercher un rôle…',
  id,
  ariaLabel,
}: RoleComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const excluded = new Set(excludeIds);
  const available = roles.filter((r) => !excluded.has(r.id));
  const filtered =
    query.trim().length === 0
      ? available
      : available.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  const handleSelect = (roleId: string) => {
    onSelect(roleId);
    setQuery('');
    setOpen(false);
  };

  const allBound = available.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={allBound ? 'Tous les rôles sont déjà liés' : placeholder}
        disabled={disabled || allBound}
        aria-label={ariaLabel ?? placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        autoComplete="off"
      />
      {open && !disabled && !allBound ? (
        <div
          role="listbox"
          aria-label="Rôles disponibles"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Aucun rôle ne correspond à « {query} ».
            </p>
          ) : (
            <ul className="py-1">
              {filtered.map((role) => (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(role.id)}
                    role="option"
                    aria-selected="false"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: roleColorHex(role.id) }}
                    />
                    <span className="truncate">{role.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
