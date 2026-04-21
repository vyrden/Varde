import type { CommandInteractionInput, EventBus, Logger, UIMessage } from '@varde/contracts';

import {
  type CommandCtxFactory,
  type CommandPermissionsPort,
  type CommandRegistry,
  routeCommandInteraction,
} from './commands.js';
import { type DiscordEventInput, mapDiscordEvent } from './mapper.js';

/**
 * Cœur testable du bot : orchestre la traduction des événements
 * discord.js en `CoreEvent` puis leur publication sur l'`EventBus`,
 * et le routage des interactions de commande via le
 * `CommandRegistry`. Le dispatcher est **indépendant de discord.js**
 * — la production branche ses handlers sur `Client.on(...)` ; les
 * tests appellent directement `dispatchEvent` et `dispatchCommand`.
 *
 * Le ctxFactory passé à la construction est invoqué à chaque
 * interaction de commande pour fournir un ctx scopé (module, guild)
 * au handler.
 */

/** Options de construction. */
export interface CreateDispatcherOptions {
  readonly eventBus: EventBus;
  readonly commandRegistry: CommandRegistry;
  readonly ctxFactory: CommandCtxFactory;
  readonly logger: Logger;
  readonly permissions?: CommandPermissionsPort;
}

/** Dispatcher public. */
export interface BotDispatcher {
  /** Traduit un événement Discord synthétique et l'émet sur l'EventBus. */
  readonly dispatchEvent: (input: DiscordEventInput) => Promise<void>;
  /** Route une interaction de commande et retourne le UIMessage réponse. */
  readonly dispatchCommand: (input: CommandInteractionInput) => Promise<UIMessage>;
}

export function createDispatcher(options: CreateDispatcherOptions): BotDispatcher {
  const { eventBus, commandRegistry, ctxFactory, permissions } = options;
  const logger = options.logger.child({ component: 'dispatcher' });

  return {
    async dispatchEvent(input) {
      try {
        const event = mapDiscordEvent(input);
        await eventBus.emit(event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn('dispatch événement Discord en échec', {
          kind: input.kind,
          error: err.message,
        });
      }
    },

    async dispatchCommand(input) {
      return routeCommandInteraction(input, {
        registry: commandRegistry,
        ctxFactory,
        ...(permissions ? { permissions } : {}),
      });
    },
  };
}
