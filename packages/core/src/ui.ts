import type { UIMessage, UIService } from '@varde/contracts';

/**
 * Factory UI normalisée. Les modules appellent uniquement ces méthodes
 * pour produire des réponses Discord ; le bot (PR 1.6) applique ensuite
 * un middleware qui refuse toute réponse qui ne passe pas par l'une
 * d'entre elles (en dev : throw ; en prod : journalisation).
 *
 * En V1 la factory est sans état et sans dépendance : chaque méthode
 * produit un `UIMessage` immuable dont le `payload` est une structure
 * JSON simple. Le rendu Discord lui-même (embed builder, boutons) est
 * fait par le bot dans PR 1.6, qui interprète le `kind` et le payload.
 */

export interface EmbedPayload {
  readonly title?: string;
  readonly description?: string;
}

export interface SuccessPayload {
  readonly message: string;
}

export interface ErrorPayload {
  readonly message: string;
}

export interface ConfirmPayload {
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

const frozen = <T>(value: T): T => Object.freeze(value);

/**
 * Construit le `UIService` contract. Pas d'options en V1 : la
 * localisation est faite par le module via `ctx.i18n.t(key)` avant
 * d'appeler la factory.
 */
export function createUIService(): UIService {
  return {
    embed(options) {
      const payload: EmbedPayload = frozen({
        ...(options.title !== undefined ? { title: options.title } : {}),
        ...(options.description !== undefined ? { description: options.description } : {}),
      });
      return frozen<UIMessage>({ kind: 'embed', payload });
    },

    success(message) {
      const payload: SuccessPayload = frozen({ message });
      return frozen<UIMessage>({ kind: 'success', payload });
    },

    error(message) {
      const payload: ErrorPayload = frozen({ message });
      return frozen<UIMessage>({ kind: 'error', payload });
    },

    confirm(options) {
      const payload: ConfirmPayload = frozen({
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirmer',
        cancelLabel: options.cancelLabel ?? 'Annuler',
      });
      return frozen<UIMessage>({ kind: 'confirm', payload });
    },
  };
}

/**
 * Garde-fou utilisé par le bot (PR 1.6) pour valider qu'une valeur
 * renvoyée par un handler de commande est bien un `UIMessage` produit
 * par la factory. Un objet qui ne passe pas cette garde est refusé
 * en dev et journalisé comme violation en prod.
 */
export function isUIMessage(value: unknown): value is UIMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  const candidate = value as { kind?: unknown; payload?: unknown };
  const kinds = ['embed', 'success', 'error', 'confirm'];
  return (
    typeof candidate.kind === 'string' &&
    kinds.includes(candidate.kind) &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}
