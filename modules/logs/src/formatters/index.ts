import type { CoreEvent, UIAttachment, UIEmbed } from '@varde/contracts';

import { formatMemberJoin } from './member-join.js';
import { formatMemberLeave } from './member-leave.js';
import { formatMessageDelete } from './message-delete.js';
import { formatMessageEdit } from './message-edit.js';

export interface FormatterContext {
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly verbosity: 'compact' | 'detailed';
}

export interface FormatterOutput {
  readonly embed: UIEmbed;
  readonly attachments: readonly UIAttachment[];
}

export type Formatter<E extends CoreEvent = CoreEvent> = (
  event: E,
  fctx: FormatterContext,
) => FormatterOutput;

/**
 * Registry `eventType → formatter`. Un event qui n'a pas de
 * formatter enregistré est silencieusement ignoré côté dispatch
 * (loggé warn). PR 4.2 ajoutera les 8 formatters restants.
 */
export const FORMATTERS: Readonly<Record<string, Formatter | undefined>> = Object.freeze({
  'guild.memberJoin': formatMemberJoin as Formatter,
  'guild.memberLeave': formatMemberLeave as Formatter,
  'guild.messageDelete': formatMessageDelete as Formatter,
  'guild.messageEdit': formatMessageEdit as Formatter,
});
