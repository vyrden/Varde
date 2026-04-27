import type { GuildMemberLeaveEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatMemberLeave: Formatter<GuildMemberLeaveEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const { fields, attachments } = fieldOrAttachment([
    { name: fctx.t('common.author'), value: `<@${event.userId}>`, inline: true },
  ]);
  const embed: UIEmbed = {
    title: fctx.t('memberLeave.title'),
    description: fctx.t('memberLeave.description', { userId: event.userId }),
    color: colorForEventType('guild.memberLeave'),
    timestamp: new Date(event.leftAt).toISOString(),
    footer: footerFor(new Date(event.leftAt)),
    fields,
  };
  return { embed, attachments };
};
