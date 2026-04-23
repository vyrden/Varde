import type { CoreEvent } from '@varde/contracts';

const MAX_PER_ROUTE = 100;

export interface RouteBufferSnapshot {
  readonly events: readonly CoreEvent[];
  readonly droppedCount: number;
  readonly markedAt: number | null;
}

export interface RouteBuffer {
  readonly push: (routeId: string, event: CoreEvent, nowMs: number) => void;
  readonly drain: (routeId: string) => readonly CoreEvent[];
  readonly snapshot: (routeId: string) => RouteBufferSnapshot;
  readonly clear: (routeId: string) => void;
  /** Retourne l'ensemble des routes actuellement cassées (avec events ou drop). */
  readonly brokenRouteIds: () => readonly string[];
}

interface Entry {
  events: CoreEvent[];
  droppedCount: number;
  markedAt: number | null;
}

export function createRouteBuffer(): RouteBuffer {
  const map = new Map<string, Entry>();

  const getOrInit = (routeId: string): Entry => {
    const existing = map.get(routeId);
    if (existing) return existing;
    const created: Entry = { events: [], droppedCount: 0, markedAt: null };
    map.set(routeId, created);
    return created;
  };

  return {
    push(routeId, event, nowMs) {
      const entry = getOrInit(routeId);
      if (entry.events.length === 0 && entry.droppedCount === 0) {
        entry.markedAt = nowMs;
      }
      if (entry.events.length >= MAX_PER_ROUTE) {
        entry.droppedCount += 1;
        return;
      }
      entry.events.push(event);
    },
    drain(routeId) {
      const entry = map.get(routeId);
      if (!entry) return [];
      const events = entry.events.slice();
      entry.events = [];
      entry.droppedCount = 0;
      entry.markedAt = null;
      return events;
    },
    snapshot(routeId) {
      const entry = map.get(routeId);
      if (!entry) return { events: [], droppedCount: 0, markedAt: null };
      return {
        events: entry.events.slice(),
        droppedCount: entry.droppedCount,
        markedAt: entry.markedAt,
      };
    },
    clear(routeId) {
      map.delete(routeId);
    },
    brokenRouteIds() {
      return Array.from(map.entries())
        .filter(([, e]) => e.events.length > 0 || e.droppedCount > 0)
        .map(([id]) => id);
    },
  };
}
