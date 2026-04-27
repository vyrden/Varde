'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import type { ReactElement } from 'react';

import { ALL_EVENT_IDS, EVENT_GROUPS, type LogEventGroup } from './event-catalog';

const GROUP_ICONS: Readonly<Record<LogEventGroup['id'], string>> = {
  members: '👤',
  messages: '💬',
  channels: '#',
  roles: '🏷️',
};

const TOTAL_EVENTS = ALL_EVENT_IDS.length;

export interface EventsSectionProps {
  readonly selectedEventIds: ReadonlySet<string>;
  readonly onSelectedEventIdsChange: (next: ReadonlySet<string>) => void;
  readonly pending?: boolean;
}

/**
 * Card « Événements à surveiller ». Grille 2×2 par famille (Membres /
 * Messages / Salons / Rôles), badges contextuels (`bruyant`), bouton
 * par groupe pour cocher/décocher en bulk + bouton global haut de
 * section. Compteur discret « X / 12 surveillés ».
 *
 * Le state vit chez le parent (shell) — la section est presentational.
 */
export function EventsSection({
  selectedEventIds,
  onSelectedEventIdsChange,
  pending = false,
}: EventsSectionProps): ReactElement {
  const toggleEvent = (eventId: string): void => {
    const next = new Set(selectedEventIds);
    if (next.has(eventId)) next.delete(eventId);
    else next.add(eventId);
    onSelectedEventIdsChange(next);
  };

  const toggleGroup = (groupEventIds: readonly string[]): void => {
    const next = new Set(selectedEventIds);
    const allChecked = groupEventIds.every((id) => next.has(id));
    if (allChecked) {
      for (const id of groupEventIds) next.delete(id);
    } else {
      for (const id of groupEventIds) next.add(id);
    }
    onSelectedEventIdsChange(next);
  };

  const checkAll = (): void => {
    onSelectedEventIdsChange(new Set(ALL_EVENT_IDS));
  };

  const uncheckAll = (): void => {
    onSelectedEventIdsChange(new Set());
  };

  const selectedCount = selectedEventIds.size;
  const allSelected = selectedCount === TOTAL_EVENTS;
  const noneSelected = selectedCount === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Événements à surveiller</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {selectedCount} / {TOTAL_EVENTS} surveillés
            </span>
            {!allSelected ? (
              <button
                type="button"
                onClick={checkAll}
                disabled={pending}
                className="rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Tout cocher
              </button>
            ) : null}
            {!noneSelected ? (
              <button
                type="button"
                onClick={uncheckAll}
                disabled={pending}
                className="rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Tout décocher
              </button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          {EVENT_GROUPS.map((group) => {
            const groupEventIds = group.events.map((e) => e.id);
            const allChecked = groupEventIds.every((id) => selectedEventIds.has(id));
            return (
              <div key={group.id} data-testid="event-group" className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span aria-hidden="true">{GROUP_ICONS[group.id]}</span>
                    <span>{group.label}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupEventIds)}
                    disabled={pending}
                    className="rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    aria-label={`${allChecked ? 'Tout décocher' : 'Tout cocher'} le groupe ${group.label}`}
                  >
                    {allChecked ? 'Tout décocher' : 'Tout cocher'}
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.events.map((event) => (
                    <label
                      key={event.id}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEventIds.has(event.id)}
                        onChange={() => toggleEvent(event.id)}
                        aria-label={event.label}
                        disabled={pending}
                        className="h-4 w-4 rounded border border-input"
                      />
                      <span>{event.label}</span>
                      {event.hint === 'bruyant' ? <Badge variant="warning">bruyant</Badge> : null}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
