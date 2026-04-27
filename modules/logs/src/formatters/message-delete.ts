import type { GuildMessageDeleteEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatMessageDelete: Formatter<GuildMessageDeleteEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const inputs = [
    { name: fctx.t('common.channel'), value: `<#${event.channelId}>`, inline: true },
    {
      name: fctx.t('common.author'),
      value: event.authorId !== null ? `<@${event.authorId}>` : fctx.t('messageDelete.noAuthor'),
      inline: true,
    },
  ];
  const { fields, attachments } = fieldOrAttachment(inputs);
  const embed: UIEmbed = {
    title: fctx.t('messageDelete.title'),
    description: fctx.t('messageDelete.description', { channelId: event.channelId }),
    color: colorForEventType('guild.messageDelete'),
    timestamp: new Date(event.deletedAt).toISOString(),
    footer: footerFor(new Date(event.deletedAt)),
    fields,
  };
  return { embed, attachments };
};
