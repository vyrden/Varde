import type { GuildChannelUpdateEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, type FieldInput, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

const parentDisplay = (id: string | null, noParent: string): string =>
  id === null ? noParent : `<#${id}>`;

const topicDisplay = (topic: string | null, noTopic: string): string =>
  topic === null || topic.length === 0 ? noTopic : topic;

export const formatChannelUpdate: Formatter<GuildChannelUpdateEvent> = (
  event,
  fctx,
): FormatterOutput => {
  const inputs: FieldInput[] = [];
  if (fctx.verbosity === 'detailed') {
    if (event.nameBefore !== event.nameAfter) {
      inputs.push({
        name: fctx.t('channelUpdate.nameBefore'),
        value: event.nameBefore,
        inline: true,
      });
      inputs.push({
        name: fctx.t('channelUpdate.nameAfter'),
        value: event.nameAfter,
        inline: true,
      });
    }
    if (event.topicBefore !== event.topicAfter) {
      const noTopic = fctx.t('channelUpdate.noTopic');
      inputs.push({
        name: fctx.t('channelUpdate.topicBefore'),
        value: topicDisplay(event.topicBefore, noTopic),
      });
      inputs.push({
        name: fctx.t('channelUpdate.topicAfter'),
        value: topicDisplay(event.topicAfter, noTopic),
      });
    }
    if (event.positionBefore !== event.positionAfter) {
      inputs.push({
        name: fctx.t('channelUpdate.positionBefore'),
        value: String(event.positionBefore),
        inline: true,
      });
      inputs.push({
        name: fctx.t('channelUpdate.positionAfter'),
        value: String(event.positionAfter),
        inline: true,
      });
    }
    if (event.parentIdBefore !== event.parentIdAfter) {
      const noParent = fctx.t('channelUpdate.noParent');
      inputs.push({
        name: fctx.t('channelUpdate.parentBefore'),
        value: parentDisplay(event.parentIdBefore, noParent),
        inline: true,
      });
      inputs.push({
        name: fctx.t('channelUpdate.parentAfter'),
        value: parentDisplay(event.parentIdAfter, noParent),
        inline: true,
      });
    }
  }
  const { fields, attachments } = fieldOrAttachment(inputs);
  const embed: UIEmbed = {
    title: fctx.t('channelUpdate.title'),
    description: fctx.t('channelUpdate.description', { channelId: event.channelId }),
    color: colorForEventType('guild.channelUpdate'),
    timestamp: new Date(event.updatedAt).toISOString(),
    footer: footerFor(new Date(event.updatedAt)),
    fields,
  };
  return { embed, attachments };
};
