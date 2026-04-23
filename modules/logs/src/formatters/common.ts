import {
  DISCORD_EMBED_FIELD_VALUE_LIMIT,
  type UIAttachment,
  type UIEmbedField,
  type UIEmbedFooter,
} from '@varde/contracts';

/**
 * Résultat d'une décision "ce contenu tient-il dans un field ?".
 * - `inline` : tient dans 1024 chars, field unique.
 * - `attachment` : ne tient pas, produit un placeholder + une pièce
 *   jointe `.txt` contenant la valeur complète.
 */
export type TruncateResult =
  | { readonly kind: 'inline'; readonly field: UIEmbedField }
  | {
      readonly kind: 'attachment';
      readonly placeholderField: UIEmbedField;
      readonly attachment: UIAttachment;
    };

const PLACEHOLDER_TEXT = 'Contenu trop long : voir la pièce jointe.';

/**
 * Décide si un contenu tient inline ou doit partir en pièce jointe.
 * La règle est stricte : > 1024 chars = pièce jointe, point. Pas de
 * troncature silencieuse du contenu utilisateur (spec).
 */
export function truncateField(
  name: string,
  value: string,
  options?: { readonly filename?: string; readonly inline?: boolean },
): TruncateResult {
  if (value.length <= DISCORD_EMBED_FIELD_VALUE_LIMIT) {
    return {
      kind: 'inline',
      field: {
        name,
        value,
        ...(options?.inline !== undefined ? { inline: options.inline } : {}),
      },
    };
  }
  const filename = options?.filename ?? `${slugify(name)}.txt`;
  return {
    kind: 'attachment',
    placeholderField: {
      name,
      value: PLACEHOLDER_TEXT,
      ...(options?.inline !== undefined ? { inline: options.inline } : {}),
    },
    attachment: {
      filename,
      contentType: 'text/plain; charset=utf-8',
      data: Buffer.from(value, 'utf-8'),
    },
  };
}

const slugify = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export interface FieldInput {
  readonly name: string;
  readonly value: string;
  readonly inline?: boolean;
  /** Filename si ce field dépasse la limite. Défaut : slug du name + ".txt". */
  readonly attachmentFilename?: string;
}

/**
 * Agrège plusieurs champs en distinguant ceux qui tiennent inline et
 * ceux qui partent en pièce jointe. Retourne la liste finale de
 * fields à mettre dans l'embed + la liste d'attachments à joindre
 * au message.
 */
export function fieldOrAttachment(inputs: readonly FieldInput[]): {
  readonly fields: readonly UIEmbedField[];
  readonly attachments: readonly UIAttachment[];
} {
  const fields: UIEmbedField[] = [];
  const attachments: UIAttachment[] = [];
  for (const input of inputs) {
    const result = truncateField(input.name, input.value, {
      ...(input.attachmentFilename !== undefined ? { filename: input.attachmentFilename } : {}),
      ...(input.inline !== undefined ? { inline: input.inline } : {}),
    });
    if (result.kind === 'inline') {
      fields.push(result.field);
    } else {
      fields.push(result.placeholderField);
      attachments.push(result.attachment);
    }
  }
  return { fields, attachments };
}

/** Couleurs par famille d'événement. Cf. spec logs.md § Formatage. */
const COLOR_BY_EVENT: Readonly<Record<string, number>> = Object.freeze({
  'guild.memberJoin': 0x2ecc71,
  'guild.memberLeave': 0xe74c3c,
  'guild.messageDelete': 0xc0392b,
  'guild.messageEdit': 0xe67e22,
});
const COLOR_DEFAULT = 0x7289da;

/** Retourne la couleur d'embed associée à un type d'événement. */
export function colorForEventType(eventType: string): number {
  return COLOR_BY_EVENT[eventType] ?? COLOR_DEFAULT;
}

/** Construit le footer d'embed standard "Varde · <ISO>". */
export function footerFor(date: Date): UIEmbedFooter {
  return {
    text: `Varde · ${date.toISOString()}`,
  };
}
