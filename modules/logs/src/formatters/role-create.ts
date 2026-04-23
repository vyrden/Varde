import type { GuildRoleCreateEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatRoleCreate: Formatter<GuildRoleCreateEvent> = (event, fctx): FormatterOutput => {
  const embed: UIEmbed = {
    title: fctx.t('roleCreate.title'),
    description: fctx.t('roleCreate.description', { roleId: event.roleId }),
    color: colorForEventType('guild.roleCreate'),
    timestamp: new Date(event.createdAt).toISOString(),
    footer: footerFor(new Date(event.createdAt)),
    fields: [],
  };
  return { embed, attachments: [] };
};
