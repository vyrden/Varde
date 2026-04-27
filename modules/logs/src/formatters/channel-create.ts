import type { GuildChannelCreateEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatChannelCreate: Formatter<GuildChannelCreateEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const embed: UIEmbed = {
    title: fctx.t('channelCreate.title'),
    description: fctx.t('channelCreate.description', { channelId: event.channelId }),
    color: colorForEventType('guild.channelCreate'),
    timestamp: new Date(event.createdAt).toISOString(),
    footer: footerFor(new Date(event.createdAt)),
    fields: [],
  };
  return { embed, attachments: [] };
};
