'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState, useTransition } from 'react';

import type { PinnedModuleDto } from '../../lib/api-client';
import { reorderPinnedModules } from '../../lib/reorder-pinned-modules';
import { savePinnedModules } from '../../lib/user-preferences-actions';
import { moduleIcon } from './module-icons';

/**
 * Section « Épinglés » de la sidebar guild (jalon 7 PR 7.4.5). Liste
 * ordonnée des modules épinglés par l'utilisateur courant pour cette
 * guild. Drag-reorderable via @dnd-kit avec alternative clavier
 * (KeyboardSensor → Tab focus drag handle, Espace pour saisir,
 * flèches pour bouger, Espace pour relâcher).
 *
 * Modules désactivés : affichés en grisé, restent cliquables (la page
 * de config est accessible même si le module est désactivé sur la
 * guild). Les positions sont persistées immédiatement après chaque
 * reorder via la server action `savePinnedModules` ; la sidebar
 * est invalidée et re-fetch au prochain render.
 *
 * Optimistic UI : on met à jour `pins` localement avant le retour
 * serveur. Si la persistance échoue (validation serveur, réseau),
 * on revient à l'état initial — le revalidatePath du layout garantit
 * la convergence finale.
 */

export interface PinnedModuleEntry {
  readonly moduleId: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface PinnedModulesSectionProps {
  readonly guildId: string;
  readonly initialPins: readonly PinnedModuleDto[];
  /**
   * Vue enrichie des modules épinglés (nom + état d'activation),
   * dérivée de `fetchModules` côté layout. La section ignore les
   * pins dont le moduleId n'a pas d'entrée correspondante (cas dégénéré
   * — module supprimé du système, le job de cleanup en background
   * passera plus tard, cf. spec PR 7.4 edge cases).
   */
  readonly modulesById: Readonly<Record<string, PinnedModuleEntry>>;
}

interface SortableItemProps {
  readonly entry: PinnedModuleEntry;
  readonly guildId: string;
  readonly currentPath: string;
  readonly grabLabel: string;
}

function SortableItem({ entry, guildId, currentPath, grabLabel }: SortableItemProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.moduleId,
  });
  const href = `/guilds/${guildId}/modules/${entry.moduleId}`;
  const active = currentPath === href || currentPath.startsWith(`${href}/`);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group/pin relative flex items-center gap-1 rounded-md ${
        isDragging ? 'z-10 shadow-md' : ''
      }`}
    >
      <button
        type="button"
        aria-label={grabLabel}
        className="flex h-9 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 ease-out hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover/pin:opacity-100"
        {...attributes}
        {...listeners}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
          <circle cx="3" cy="3" r="1" fill="currentColor" />
          <circle cx="7" cy="3" r="1" fill="currentColor" />
          <circle cx="3" cy="7" r="1" fill="currentColor" />
          <circle cx="7" cy="7" r="1" fill="currentColor" />
          <circle cx="3" cy="11" r="1" fill="currentColor" />
          <circle cx="7" cy="11" r="1" fill="currentColor" />
        </svg>
      </button>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex flex-1 items-center gap-3 rounded-md px-2 py-2 text-[14px] font-medium transition-[background-color,color] duration-150 ease-out ${
          active
            ? 'bg-surface-active text-foreground'
            : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
        } ${entry.enabled ? '' : 'opacity-60'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1/2 left-0 h-5 w-[3px] -translate-x-1.5 -translate-y-1/2 rounded-full bg-primary transition-transform duration-200 ease-out ${
            active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'
          }`}
        />
        <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">
          {moduleIcon(entry.moduleId, 16)}
        </span>
        <span className="flex-1 truncate">{entry.name}</span>
      </Link>
    </li>
  );
}

export function PinnedModulesSection({
  guildId,
  initialPins,
  modulesById,
}: PinnedModulesSectionProps): ReactElement | null {
  const t = useTranslations('sidebar.pinned');
  const [pins, setPins] = useState<readonly PinnedModuleDto[]>(initialPins);
  const [, startTransition] = useTransition();
  const pathname = usePathname() ?? '';

  // PointerSensor + KeyboardSensor — l'alternative clavier est ce qui
  // satisfait l'anti-pattern n°13 du design system (« pas de DnD sans
  // alternative clavier »). Tab pour focus, Espace pour saisir, flèches
  // pour bouger, Espace pour relâcher.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (pins.length === 0) return null;

  // Filtrage défensif : ignore les pins dont le moduleId n'a pas
  // d'entrée correspondante côté modules (module supprimé du système,
  // cleanup background pas encore passé). Pas d'erreur côté UI.
  const items = pins
    .map((pin) => {
      const entry = modulesById[pin.moduleId];
      return entry ? { pin, entry } : null;
    })
    .filter((value): value is { pin: PinnedModuleDto; entry: PinnedModuleEntry } => value !== null);

  if (items.length === 0) return null;

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) return;
    const next = reorderPinnedModules(pins, String(active.id), String(over.id));
    if (next === pins) return;
    setPins(next);
    startTransition(() => {
      void savePinnedModules(guildId, [...next]).then((state) => {
        if (state.kind === 'error') {
          // Revert local en cas d'échec serveur. Le revalidatePath
          // ne sera pas tiré côté action, donc l'état local doit
          // converger vers initialPins manuellement.
          setPins(initialPins);
        }
      });
    });
  };

  return (
    <div className="px-3 pt-3 pb-1">
      <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {t('label')}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((it) => it.pin.moduleId)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            {items.map(({ entry }) => (
              <SortableItem
                key={entry.moduleId}
                entry={entry}
                guildId={guildId}
                currentPath={pathname}
                grabLabel={t('grabHandle', { name: entry.name })}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
