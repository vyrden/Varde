import type { GuildMessageCreateEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, type FieldInput, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatMessageCreate: Formatter<GuildMessageCreateEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const inputs: FieldInput[] = [];
  if (fctx.verbosity === 'detailed' && event.content.length > 0) {
    inputs.push({
      name: fctx.t('messageCreate.content'),
      value: event.content,
      attachmentFilename: 'content.txt',
    });
  }
  const { fields, attachments } = fieldOrAttachment(inputs);
  const embed: UIEmbed = {
    title: fctx.t('messageCreate.title'),
    description: fctx.t('messageCreate.description', {
      authorId: event.authorId,
      channelId: event.channelId,
    }),
    color: colorForEventType('guild.messageCreate'),
    timestamp: new Date(event.createdAt).toISOString(),
    footer: footerFor(new Date(event.createdAt)),
    fields,
  };
  return { embed, attachments };
};
