import type { GuildMemberUpdateEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, type FieldInput, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

export const formatMemberUpdate: Formatter<GuildMemberUpdateEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const inputs: FieldInput[] = [];
  if (fctx.verbosity === 'detailed') {
    if (event.rolesAdded.length > 0) {
      inputs.push({
        name: fctx.t('memberUpdate.rolesAdded'),
        value: event.rolesAdded.map((id) => `<@&${id}>`).join(', '),
      });
    }
    if (event.rolesRemoved.length > 0) {
      inputs.push({
        name: fctx.t('memberUpdate.rolesRemoved'),
        value: event.rolesRemoved.map((id) => `<@&${id}>`).join(', '),
      });
    }
    if (event.nickBefore !== event.nickAfter) {
      inputs.push({
        name: fctx.t('memberUpdate.nickBefore'),
        value: event.nickBefore ?? fctx.t('memberUpdate.noNick'),
        inline: true,
      });
      inputs.push({
        name: fctx.t('memberUpdate.nickAfter'),
        value: event.nickAfter ?? fctx.t('memberUpdate.noNick'),
        inline: true,
      });
    }
  }
  const { fields, attachments } = fieldOrAttachment(inputs);
  const embed: UIEmbed = {
    title: fctx.t('memberUpdate.title'),
    description: fctx.t('memberUpdate.description', { userId: event.userId }),
    color: colorForEventType('guild.memberUpdate'),
    timestamp: new Date(event.updatedAt).toISOString(),
    footer: footerFor(new Date(event.updatedAt)),
    fields,
  };
  return { embed, attachments };
};
