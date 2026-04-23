import type { CoreEvent } from '@varde/contracts';

const MAX_PER_ROUTE = 100;

/** Métadonnées associées à une route cassée. */
export interface RouteMeta {
  readonly guildId: string;
  readonly channelId: string;
  readonly reason: string;
}

export interface RouteBufferSnapshot {
  readonly events: readonly CoreEvent[];
  readonly droppedCount: number;
  readonly markedAt: number | null;
}

/** Snapshot enrichi d'une route cassée — inclut les méta de la route. */
export interface BrokenRouteSnapshot extends RouteBufferSnapshot {
  readonly guildId: string;
  readonly channelId: string;
  readonly reason: string;
}

export interface RouteBuffer {
  readonly push: (routeId: string, event: CoreEvent, nowMs: number, meta?: RouteMeta) => void;
  readonly drain: (routeId: string) => readonly CoreEvent[];
  readonly snapshot: (routeId: string) => RouteBufferSnapshot;
  readonly clear: (routeId: string) => void;
  /** Retourne l'ensemble des routes actuellement cassées (avec events ou drop). */
  readonly brokenRouteIds: () => readonly string[];
  /**
   * Retourne un snapshot de toutes les routes cassées, avec leurs méta-données.
   * Seules les routes ayant au moins un event bufferisé ou un drop sont incluses.
   */
  readonly snapshotAll: () => ReadonlyMap<string, BrokenRouteSnapshot>;
}

interface Entry {
  events: CoreEvent[];
  droppedCount: number;
  markedAt: number | null;
  guildId: string;
  channelId: string;
  reason: string;
}

export function createRouteBuffer(): RouteBuffer {
  const map = new Map<string, Entry>();

  const getOrInit = (routeId: string, meta?: RouteMeta): Entry => {
    const existing = map.get(routeId);
    if (existing) return existing;
    const created: Entry = {
      events: [],
      droppedCount: 0,
      markedAt: null,
      guildId: meta?.guildId ?? '',
      channelId: meta?.channelId ?? '',
      reason: meta?.reason ?? '',
    };
    map.set(routeId, created);
    return created;
  };

  return {
    push(routeId, event, nowMs, meta) {
      const entry = getOrInit(routeId, meta);
      // Mettre à jour les méta si elles sont fournies — la dernière erreur connue prime.
      if (meta) {
        entry.guildId = meta.guildId;
        entry.channelId = meta.channelId;
        entry.reason = meta.reason;
      }
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
    snapshotAll() {
      const result = new Map<string, BrokenRouteSnapshot>();
      for (const [routeId, entry] of map) {
        if (entry.events.length === 0 && entry.droppedCount === 0) continue;
        result.set(routeId, {
          events: entry.events.slice(),
          droppedCount: entry.droppedCount,
          markedAt: entry.markedAt,
          guildId: entry.guildId,
          channelId: entry.channelId,
          reason: entry.reason,
        });
      }
      return result;
    },
  };
}
