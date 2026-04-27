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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@varde/ui';
import type { ReactElement } from 'react';

import type { EmojiCatalog, RoleOption } from '../types';
import { isPairValid, makeButtonDraft, makeReactionDraft } from './editor-helpers';
import type { PairDraft } from './editor-types';
import { PairRow } from './PairRow';

const MAX_PAIRS = 20;
const BUTTONS_PER_ROW = 5;

interface SortableRowProps {
  readonly pair: PairDraft;
  readonly index: number;
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  readonly canRemove: boolean;
  readonly onChange: (next: PairDraft) => void;
  readonly onRemove: () => void;
}

function GripIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9" cy="3.5" r="1" fill="currentColor" />
      <circle cx="5" cy="7" r="1" fill="currentColor" />
      <circle cx="9" cy="7" r="1" fill="currentColor" />
      <circle cx="5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="9" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Wrapper Sortable autour d'une `PairRow`. dnd-kit gère
 * `transform`/`transition` via le hook ; on injecte le drag handle
 * dans le slot prévu par `PairRow`.
 */
function SortablePairRow({
  pair,
  index,
  roles,
  emojis,
  canRemove,
  onChange,
  onRemove,
}: SortableRowProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pair.uid,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dragHandle = (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Réordonner l'élément ${index + 1}`}
      title="Glisse pour réordonner"
      className="flex size-5 cursor-grab touch-none items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
    >
      <GripIcon />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <PairRow
        pair={pair}
        index={index}
        roles={roles}
        emojis={emojis}
        canRemove={canRemove}
        onChange={onChange}
        onRemove={onRemove}
        dragHandle={dragHandle}
      />
    </div>
  );
}

export interface ElementsSectionProps {
  readonly pairs: readonly PairDraft[];
  readonly onPairsChange: (next: readonly PairDraft[]) => void;
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  readonly pending?: boolean;
}

/**
 * Card « Éléments » : liste des paires avec drag-and-drop (dnd-kit),
 * boutons d'ajout réaction/bouton, compteur 1/20. Validation inline
 * remontée par chaque `PairRow`. Indicateur visuel après chaque
 * groupe de 5 boutons consécutifs (= 1 action row Discord) pour
 * aider l'admin à anticiper le rendu.
 */
export function ElementsSection({
  pairs,
  onPairsChange,
  roles,
  emojis,
  pending = false,
}: ElementsSectionProps): ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handlePairChange = (index: number, updated: PairDraft): void => {
    onPairsChange(pairs.map((p, i) => (i === index ? updated : p)));
  };

  const handleAddReaction = (): void => {
    onPairsChange([...pairs, makeReactionDraft()]);
  };

  const handleAddButton = (): void => {
    onPairsChange([...pairs, makeButtonDraft()]);
  };

  const handleRemovePair = (index: number): void => {
    onPairsChange(pairs.filter((_, i) => i !== index));
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const oldIndex = pairs.findIndex((p) => p.uid === active.id);
    const newIndex = pairs.findIndex((p) => p.uid === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onPairsChange(arrayMove([...pairs], oldIndex, newIndex));
  };

  const validCount = pairs.filter((p) => isPairValid(p)).length;
  const buttonCount = pairs.filter((p) => p.kind === 'button').length;

  // Calcul des indices après lesquels insérer un séparateur de
  // « rangée Discord » : tous les 5 boutons consécutifs vus dans
  // l'ordre courant. On compte dans l'ordre du tableau, mais Discord
  // groupe par type — pour rester simple et utile, on indique
  // simplement le séparateur après chaque 5e bouton observé.
  const buttonRowMarkers = new Set<number>();
  let buttonsSeen = 0;
  pairs.forEach((p, idx) => {
    if (p.kind === 'button') {
      buttonsSeen += 1;
      if (buttonsSeen % BUTTONS_PER_ROW === 0 && idx < pairs.length - 1) {
        buttonRowMarkers.add(idx);
      }
    }
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Éléments</CardTitle>
          <CardDescription>
            Mélange librement des réactions emoji et des boutons. Discord limite à {MAX_PAIRS}{' '}
            éléments par message — les boutons sont rendus sur 4 rangées de {BUTTONS_PER_ROW} max.
          </CardDescription>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {pairs.length} / {MAX_PAIRS}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {pairs.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-xs text-muted-foreground">
            Aucun élément. Ajoute une réaction ou un bouton ci-dessous.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={pairs.map((p) => p.uid)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {pairs.map((pair, i) => (
                  <div key={pair.uid}>
                    <SortablePairRow
                      pair={pair}
                      index={i}
                      roles={roles}
                      emojis={emojis}
                      canRemove={pairs.length > 1}
                      onChange={(updated) => handlePairChange(i, updated)}
                      onRemove={() => handleRemovePair(i)}
                    />
                    {buttonRowMarkers.has(i) ? (
                      <div className="my-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        <span>Nouvelle rangée Discord</span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddReaction}
            disabled={pending || pairs.length >= MAX_PAIRS}
          >
            + Réaction emoji
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddButton}
            disabled={pending || pairs.length >= MAX_PAIRS}
          >
            + Bouton Discord
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {validCount} / {pairs.length} prêt{validCount > 1 ? 's' : ''}
            {buttonCount > 0 ? ` · ${buttonCount} bouton${buttonCount > 1 ? 's' : ''}` : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
