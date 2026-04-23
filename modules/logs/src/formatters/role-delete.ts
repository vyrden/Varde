import type { GuildRoleDeleteEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatRoleDelete: Formatter<GuildRoleDeleteEvent> = (event, fctx): FormatterOutput => {
  const embed: UIEmbed = {
    title: fctx.t('roleDelete.title'),
    description: fctx.t('roleDelete.description', { roleId: event.roleId }),
    color: colorForEventType('guild.roleDelete'),
    timestamp: new Date(event.deletedAt).toISOString(),
    footer: footerFor(new Date(event.deletedAt)),
    fields: [],
  };
  return { embed, attachments: [] };
};
