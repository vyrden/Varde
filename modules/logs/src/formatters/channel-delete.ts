import type { GuildChannelDeleteEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatChannelDelete: Formatter<GuildChannelDeleteEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const embed: UIEmbed = {
    title: fctx.t('channelDelete.title'),
    description: fctx.t('channelDelete.description', { channelId: event.channelId }),
    color: colorForEventType('guild.channelDelete'),
    timestamp: new Date(event.deletedAt).toISOString(),
    footer: footerFor(new Date(event.deletedAt)),
    fields: [],
  };
  return { embed, attachments: [] };
};
