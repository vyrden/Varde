import type {
  ButtonHandler,
  ButtonInteractionInput,
  InteractionsService,
  ModuleId,
  UIMessage,
} from '@varde/contracts';
import { ModuleError } from '@varde/contracts';

/**
 * Routeur d'interactions partagé entre modules. Exposé en deux
 * surfaces :
 *
 * - `InteractionsService` côté module (via `ctx.interactions`) : un
 *   module appelle `onButton(prefix, handler)` au `onLoad` pour
 *   capter les clics sur les boutons qu'il a publiés.
 * - `dispatchButton(input)` côté host (apps/bot) : appelé par le
 *   listener `interactionCreate` de discord.js pour acheminer un
 *   click au bon module.
 *
 * Les handlers sont indexés par préfixe de `customId`. Le préfixe
 * doit être unique dans le runtime — un module qui tente
 * d'enregistrer le même préfixe qu'un autre lève `ModuleError`. Les
 * `customId` Discord sont limités à 100 caractères et c'est au module
 * de s'organiser pour ne pas dépasser ; le routeur ne valide pas la
 * taille.
 *
 * Le tri des préfixes au matching est descendant par longueur : un
 * customId `rr:msg-1:role-2` matche d'abord un handler enregistré
 * sur `rr:msg-1:` avant de retomber sur `rr:`. Ça permet aux modules
 * d'avoir plusieurs handlers spécialisés en plus d'un fallback.
 */

interface RegisteredHandler {
  readonly moduleId: ModuleId;
  readonly prefix: string;
  readonly handler: ButtonHandler;
}

export interface CoreInteractionsRegistry {
  /** Enregistre un handler pour un module + préfixe donnés. */
  readonly registerButton: (
    moduleId: ModuleId,
    prefix: string,
    handler: ButtonHandler,
  ) => () => void;
  /** Supprime tous les handlers enregistrés par un module. */
  readonly unregisterModule: (moduleId: ModuleId) => void;
  /**
   * Dispatch un click vers le handler matchant. Retourne le résultat
   * `UIMessage` produit par le handler ou `null` si aucun handler n'a
   * matché (ou si le handler a renvoyé `null`/`void`).
   */
  readonly dispatchButton: (input: ButtonInteractionInput) => Promise<UIMessage | null>;
  /**
   * Crée un service module-scope qui n'autorise les enregistrements
   * que pour le moduleId fourni — c'est ce service qui est exposé via
   * `ctx.interactions`.
   */
  readonly serviceFor: (moduleId: ModuleId) => InteractionsService;
}

export function createInteractionsRegistry(): CoreInteractionsRegistry {
  const handlers = new Map<string, RegisteredHandler>();

  const registerButton = (
    moduleId: ModuleId,
    prefix: string,
    handler: ButtonHandler,
  ): (() => void) => {
    if (prefix.length === 0) {
      throw new ModuleError('InteractionsService.onButton : prefix vide interdit', moduleId, {
        metadata: { prefix },
      });
    }
    const existing = handlers.get(prefix);
    if (existing && existing.moduleId !== moduleId) {
      throw new ModuleError(
        `InteractionsService.onButton : préfixe "${prefix}" déjà utilisé par "${existing.moduleId}"`,
        moduleId,
        { metadata: { prefix, conflict: existing.moduleId } },
      );
    }
    handlers.set(prefix, { moduleId, prefix, handler });
    let detached = false;
    return () => {
      if (detached) return;
      detached = true;
      const current = handlers.get(prefix);
      if (current && current.handler === handler) {
        handlers.delete(prefix);
      }
    };
  };

  const unregisterModule = (moduleId: ModuleId): void => {
    for (const [prefix, entry] of handlers) {
      if (entry.moduleId === moduleId) handlers.delete(prefix);
    }
  };

  const dispatchButton = async (input: ButtonInteractionInput): Promise<UIMessage | null> => {
    // Tri descendant par longueur de préfixe pour que le préfixe le
    // plus spécifique gagne en cas de chevauchement.
    const sorted = Array.from(handlers.values()).sort((a, b) => b.prefix.length - a.prefix.length);
    for (const entry of sorted) {
      if (input.customId.startsWith(entry.prefix)) {
        const result = await entry.handler(input);
        return result ?? null;
      }
    }
    return null;
  };

  const serviceFor = (moduleId: ModuleId): InteractionsService => ({
    onButton(customIdPrefix, handler) {
      return registerButton(moduleId, customIdPrefix, handler);
    },
  });

  return { registerButton, unregisterModule, dispatchButton, serviceFor };
}
