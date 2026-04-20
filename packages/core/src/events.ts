import type { CoreEvent, CoreEventType, EventBus, EventHandler, Logger } from '@varde/contracts';

/**
 * EventBus in-process, typé par l'union discriminée `CoreEvent` de
 * `@varde/contracts`. Les handlers sont isolés : une exception dans
 * l'un ne casse pas le dispatch des autres — elle est journalisée
 * comme warn via le logger injecté.
 *
 * Limite assumée V1 : pas d'adapter Redis pub/sub. Le bus vit dans
 * le processus. Le déploiement bot ↔ api en multi-process viendra
 * post-V1 avec un adapter séparé (voir ADR 0003 sur le mode
 * dégradé). Les modules ne doivent pas présumer d'un bus unique entre
 * process : le contrat reste compatible avec un adapter distribué.
 */

type GenericHandler = (event: CoreEvent) => Promise<void> | void;

/** Options de construction. */
export interface CreateEventBusOptions {
  readonly logger: Logger;
}

/**
 * Construit un EventBus typé. Retourne une instance conforme au
 * contrat `EventBus` avec les garanties d'isolation et de typage
 * ci-dessus.
 */
export function createEventBus(options: CreateEventBusOptions): EventBus {
  const logger = options.logger.child({ component: 'events' });
  const handlers = new Map<CoreEventType, Set<GenericHandler>>();
  const wildcards = new Set<GenericHandler>();

  const safeInvoke = async (handler: GenericHandler, event: CoreEvent): Promise<void> => {
    try {
      await handler(event);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn('event handler failed', { eventType: event.type, error: err.message });
    }
  };

  return {
    async emit(event) {
      const typed = handlers.get(event.type);
      const invocations: Promise<void>[] = [];
      if (typed) {
        for (const handler of typed) {
          invocations.push(safeInvoke(handler, event));
        }
      }
      for (const handler of wildcards) {
        invocations.push(safeInvoke(handler, event));
      }
      await Promise.allSettled(invocations);
    },

    on(type, handler) {
      const set = handlers.get(type) ?? new Set<GenericHandler>();
      set.add(handler as GenericHandler);
      handlers.set(type, set);
      return () => {
        const current = handlers.get(type);
        if (!current) return;
        current.delete(handler as GenericHandler);
        if (current.size === 0) {
          handlers.delete(type);
        }
      };
    },

    onAny(handler) {
      wildcards.add(handler as GenericHandler);
      return () => {
        wildcards.delete(handler as GenericHandler);
      };
    },
  };
}

/** Re-export du type handler pour ergonomie côté consommateurs. */
export type { EventHandler };
