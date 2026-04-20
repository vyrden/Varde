import type {
  CommandInteractionInput,
  EventBus,
  Logger,
  UIMessage,
  UIService,
} from '@varde/contracts';

import {
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
 * Cette séparation suit la directive "Intégration avec un mock
 * gateway minimal" du plan : aucun test ne monte un Client discord.js
 * réel, mais le chemin logique testé (mapping → bus → handlers →
 * routing) est le même qu'en prod.
 *
 * Gestion d'erreurs :
 * - `dispatchEvent` : toute exception pendant la traduction ou la
 *   publication est loguée en warn ; ne remonte pas pour ne pas
 *   casser le dispatch suivant.
 * - `dispatchCommand` : propage les ModuleError levées par le routing
 *   (ex. handler qui ne retourne pas un UIMessage) — c'est à
 *   l'appelant (wiring discord.js) de les transformer en
 *   journalisation + réponse d'erreur utilisateur.
 */

/** Options de construction. */
export interface CreateDispatcherOptions {
  readonly eventBus: EventBus;
  readonly commandRegistry: CommandRegistry;
  readonly ui: UIService;
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
  const { eventBus, commandRegistry, ui, permissions } = options;
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
        ui,
        ...(permissions ? { permissions } : {}),
      });
    },
  };
}
