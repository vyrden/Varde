'use client';

import { Button, Input } from '@varde/ui';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';

/**
 * Multi-sélecteur générique avec chips + popover de recherche. Pattern
 * GitHub / Linear / Notion : on voit ce qui est déjà sélectionné en
 * chips inline, un bouton ouvre une boîte filtrable.
 *
 * Paramétré pour deux usages :
 * - `entityKind: 'role'`   → chips `@nom`, accent primary, libellés
 *   « rôle ».
 * - `entityKind: 'channel'` → chips `#nom`, accent neutre, libellés
 *   « salon ».
 *
 * Click externe ferme le popover, Échap ferme. Le popover reste
 * ouvert après ajout pour permettre des sélections en chaîne.
 */

export type EntityKind = 'role' | 'channel';

export interface EntityOption {
  readonly id: string;
  readonly name: string;
}

export interface EntityMultiPickerProps {
  readonly entityKind: EntityKind;
  readonly entities: ReadonlyArray<EntityOption>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly pending?: boolean;
  readonly onChange: (next: ReadonlyArray<string>) => void;
  /** Override du libellé du bouton "+ Ajouter…". */
  readonly addLabel?: string;
  /** Override du placeholder du champ recherche. */
  readonly searchPlaceholder?: string;
  /** Override du libellé "Aucun X sélectionné". */
  readonly emptyLabel?: string;
  /** Override de l'aria-label du popover. */
  readonly popoverAriaLabel?: string;
}

interface EntityKindLabels {
  readonly chipPrefix: string;
  readonly chipClass: string;
  readonly chipChevronClass: string;
  readonly addLabel: string;
  readonly searchPlaceholder: string;
  readonly emptyLabel: string;
  readonly popoverAriaLabel: string;
  readonly noResults: string;
  readonly removeAria: (name: string) => string;
}

const LABELS: Record<EntityKind, EntityKindLabels> = {
  role: {
    chipPrefix: '@',
    chipClass: 'bg-primary/15 text-primary',
    chipChevronClass: 'text-primary/70 hover:text-destructive',
    addLabel: '+ Ajouter un rôle',
    searchPlaceholder: 'Rechercher un rôle…',
    emptyLabel: 'Aucun rôle sélectionné',
    popoverAriaLabel: 'Rôles disponibles',
    noResults: 'Aucun résultat.',
    removeAria: (name) => `Retirer ${name}`,
  },
  channel: {
    chipPrefix: '#',
    chipClass: 'bg-info/15 text-foreground',
    chipChevronClass: 'text-muted-foreground hover:text-destructive',
    addLabel: '+ Ajouter un salon',
    searchPlaceholder: 'Rechercher un salon…',
    emptyLabel: 'Aucun salon sélectionné',
    popoverAriaLabel: 'Salons disponibles',
    noResults: 'Aucun résultat.',
    removeAria: (name) => `Retirer ${name}`,
  },
};

export function EntityMultiPicker({
  entityKind,
  entities,
  selectedIds,
  pending = false,
  onChange,
  addLabel,
  searchPlaceholder,
  emptyLabel,
  popoverAriaLabel,
}: EntityMultiPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverId = useId();
  const labels = LABELS[entityKind];

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectedSet = new Set(selectedIds);
  const selectedEntities = entities.filter((e) => selectedSet.has(e.id));
  const availableEntities = entities
    .filter((e) => !selectedSet.has(e.id))
    .filter((e) => (filter === '' ? true : e.name.toLowerCase().includes(filter.toLowerCase())));

  const add = (id: string): void => {
    onChange([...selectedIds, id]);
    setFilter('');
    inputRef.current?.focus();
  };
  const remove = (id: string): void => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  const renderedAddLabel = addLabel ?? labels.addLabel;
  const renderedEmptyLabel = emptyLabel ?? labels.emptyLabel;
  const renderedPopoverAria = popoverAriaLabel ?? labels.popoverAriaLabel;
  const renderedSearchPlaceholder = searchPlaceholder ?? labels.searchPlaceholder;

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedEntities.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">{renderedEmptyLabel}</span>
        ) : (
          selectedEntities.map((entity) => (
            <span
              key={entity.id}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${labels.chipClass}`}
            >
              {labels.chipPrefix}
              {entity.name}
              <button
                type="button"
                onClick={() => remove(entity.id)}
                disabled={pending}
                aria-label={labels.removeAria(entity.name)}
                className={labels.chipChevronClass}
              >
                ×
              </button>
            </span>
          ))
        )}
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            disabled={pending || entities.length === selectedEntities.length}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={popoverId}
          >
            {renderedAddLabel}
          </Button>
          {open ? (
            <div
              id={popoverId}
              role="listbox"
              aria-label={renderedPopoverAria}
              className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-card p-2 shadow-md"
            >
              <Input
                ref={inputRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={renderedSearchPlaceholder}
                className="mb-2"
                aria-label={renderedSearchPlaceholder}
              />
              <div className="max-h-56 overflow-y-auto">
                {availableEntities.length === 0 ? (
                  <p className="px-2 py-2 text-xs italic text-muted-foreground">
                    {filter === '' ? renderedEmptyLabel : labels.noResults}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {availableEntities.map((entity) => (
                      <li key={entity.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected="false"
                          onClick={() => add(entity.id)}
                          className="w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-surface-active"
                        >
                          {labels.chipPrefix}
                          {entity.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
