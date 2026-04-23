import type { UIAttachment, UIEmbed, UIMessage, UIService } from '@varde/contracts';

/**
 * Factory UI normalisée. Les modules appellent uniquement ces méthodes
 * pour produire des `UIMessage`s. Le rendu Discord (EmbedBuilder,
 * AttachmentBuilder) vit côté `apps/bot/src/client-adapter.ts`.
 *
 * En V1 la factory est sans état et sans dépendance : chaque méthode
 * produit un `UIMessage` immuable. Les payloads sont figés via
 * `Object.freeze` pour que les modules ne puissent pas muter un
 * message après création.
 */

const frozen = <T>(value: T): T => Object.freeze(value);

/** Clone figé d'un UIEmbed en copiant les champs optionnels définis. */
const freezeEmbed = (source: UIEmbed): UIEmbed => {
  const payload: Record<string, unknown> = {};
  if (source.title !== undefined) payload['title'] = source.title;
  if (source.description !== undefined) payload['description'] = source.description;
  if (source.url !== undefined) payload['url'] = source.url;
  if (source.color !== undefined) payload['color'] = source.color;
  if (source.timestamp !== undefined) payload['timestamp'] = source.timestamp;
  if (source.author !== undefined) payload['author'] = frozen({ ...source.author });
  if (source.footer !== undefined) payload['footer'] = frozen({ ...source.footer });
  if (source.fields !== undefined) {
    payload['fields'] = frozen(source.fields.map((field) => frozen({ ...field })));
  }
  if (source.thumbnailUrl !== undefined) payload['thumbnailUrl'] = source.thumbnailUrl;
  if (source.imageUrl !== undefined) payload['imageUrl'] = source.imageUrl;
  return frozen(payload) as UIEmbed;
};

const freezeAttachments = (attachments: readonly UIAttachment[]): readonly UIAttachment[] =>
  frozen(attachments.map((a) => frozen({ ...a })));

export function createUIService(): UIService {
  return {
    embed(options, attachments) {
      const payload = freezeEmbed(options);
      const base: { kind: 'embed'; payload: UIEmbed; attachments?: readonly UIAttachment[] } = {
        kind: 'embed',
        payload,
      };
      if (attachments !== undefined && attachments.length > 0) {
        base.attachments = freezeAttachments(attachments);
      }
      return frozen<UIMessage>(base);
    },

    success(message) {
      return frozen<UIMessage>({ kind: 'success', payload: frozen({ message }) });
    },

    error(message) {
      return frozen<UIMessage>({ kind: 'error', payload: frozen({ message }) });
    },

    confirm(options) {
      return frozen<UIMessage>({
        kind: 'confirm',
        payload: frozen({
          message: options.message,
          confirmLabel: options.confirmLabel ?? 'Confirmer',
          cancelLabel: options.cancelLabel ?? 'Annuler',
        }),
      });
    },
  };
}

/**
 * Garde-fou utilisé par le bot pour valider qu'une valeur renvoyée
 * par un handler de commande est bien un `UIMessage` produit par la
 * factory. Un objet qui ne passe pas cette garde est refusé en dev.
 */
export function isUIMessage(value: unknown): value is UIMessage {
  if (typeof value !== 'object' || value === null) return false;
  if (!Object.isFrozen(value)) return false;
  const candidate = value as { kind?: unknown; payload?: unknown };
  const kinds = ['embed', 'success', 'error', 'confirm'];
  return (
    typeof candidate.kind === 'string' &&
    kinds.includes(candidate.kind) &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}
