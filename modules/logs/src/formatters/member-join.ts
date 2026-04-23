import type { GuildMemberJoinEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, type FieldInput, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatMemberJoin: Formatter<GuildMemberJoinEvent> = (event, fctx): FormatterOutput => {
  const inputs: FieldInput[] = [
    { name: fctx.t('common.author'), value: `<@${event.userId}>`, inline: true },
  ];
  if (fctx.verbosity === 'detailed' && event.inviterId !== undefined) {
    inputs.push({
      name: fctx.t('memberJoin.inviter'),
      value: `<@${event.inviterId}>`,
      inline: true,
    });
  }
  const { fields, attachments } = fieldOrAttachment(inputs);
  const embed: UIEmbed = {
    title: fctx.t('memberJoin.title'),
    description: fctx.t('memberJoin.description', { userId: event.userId }),
    color: colorForEventType('guild.memberJoin'),
    timestamp: new Date(event.joinedAt).toISOString(),
    footer: footerFor(new Date(event.joinedAt)),
    fields,
  };
  return { embed, attachments };
};
