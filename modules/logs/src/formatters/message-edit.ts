import type { GuildMessageEditEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, type FieldInput, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatMessageEdit: Formatter<GuildMessageEditEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const inputs: FieldInput[] = [
    { name: fctx.t('common.channel'), value: `<#${event.channelId}>`, inline: true },
    { name: fctx.t('common.author'), value: `<@${event.authorId}>`, inline: true },
  ];
  if (fctx.verbosity === 'detailed') {
    if (event.contentBefore !== null && event.contentBefore.length > 0) {
      inputs.push({
        name: fctx.t('messageEdit.contentBefore'),
        value: event.contentBefore,
        attachmentFilename: 'before.txt',
      });
    }
    if (event.contentAfter.length > 0) {
      inputs.push({
        name: fctx.t('messageEdit.contentAfter'),
        value: event.contentAfter,
        attachmentFilename: 'after.txt',
      });
    }
  }
  const { fields, attachments } = fieldOrAttachment(inputs);
  const embed: UIEmbed = {
    title: fctx.t('messageEdit.title'),
    description: fctx.t('messageEdit.description', { channelId: event.channelId }),
    color: colorForEventType('guild.messageEdit'),
    timestamp: new Date(event.editedAt).toISOString(),
    footer: footerFor(new Date(event.editedAt)),
    fields,
  };
  return { embed, attachments };
};
