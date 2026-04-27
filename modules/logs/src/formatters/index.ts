import type { CoreEvent, UIAttachment, UIEmbed } from '@varde/contracts';

import { formatChannelCreate } from './channel-create.js';
import { formatChannelDelete } from './channel-delete.js';
import { formatChannelUpdate } from './channel-update.js';
import { formatMemberJoin } from './member-join.js';
import { formatMemberLeave } from './member-leave.js';
import { formatMemberUpdate } from './member-update.js';
import { formatMessageCreate } from './message-create.js';
import { formatMessageDelete } from './message-delete.js';
import { formatMessageEdit } from './message-edit.js';
import { formatRoleCreate } from './role-create.js';
import { formatRoleDelete } from './role-delete.js';
import { formatRoleUpdate } from './role-update.js';

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
 * (loggé warn). Couvre les 12 events `guild.*` pertinents (PR 4.2).
 */
export const FORMATTERS: Readonly<Record<string, Formatter | undefined>> = Object.freeze({
  'guild.memberJoin': formatMemberJoin as Formatter,
  'guild.memberLeave': formatMemberLeave as Formatter,
  'guild.memberUpdate': formatMemberUpdate as Formatter,
  'guild.messageCreate': formatMessageCreate as Formatter,
  'guild.messageDelete': formatMessageDelete as Formatter,
  'guild.messageEdit': formatMessageEdit as Formatter,
  'guild.channelCreate': formatChannelCreate as Formatter,
  'guild.channelUpdate': formatChannelUpdate as Formatter,
  'guild.channelDelete': formatChannelDelete as Formatter,
  'guild.roleCreate': formatRoleCreate as Formatter,
  'guild.roleUpdate': formatRoleUpdate as Formatter,
  'guild.roleDelete': formatRoleDelete as Formatter,
});
