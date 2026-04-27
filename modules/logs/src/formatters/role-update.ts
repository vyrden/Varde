import type { GuildRoleUpdateEvent, UIEmbed } from '@varde/contracts';

import { colorForEventType, type FieldInput, fieldOrAttachment, footerFor } from './common.js';
import type { Formatter, FormatterOutput } from './index.js';

const colorHex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

const boolLabel = (value: boolean, fctx: { t: (key: string) => string }): string =>
  value ? fctx.t('roleUpdate.yes') : fctx.t('roleUpdate.no');

export const formatRoleUpdate: Formatter<GuildRoleUpdateEvent> = (event, fctx): FormatterOutput => {
  const inputs: FieldInput[] = [];
  if (fctx.verbosity === 'detailed') {
    if (event.nameBefore !== event.nameAfter) {
      inputs.push({
        name: fctx.t('roleUpdate.nameBefore'),
        value: event.nameBefore,
        inline: true,
      });
      inputs.push({
        name: fctx.t('roleUpdate.nameAfter'),
        value: event.nameAfter,
        inline: true,
      });
    }
    if (event.colorBefore !== event.colorAfter) {
      inputs.push({
        name: fctx.t('roleUpdate.colorBefore'),
        value: colorHex(event.colorBefore),
        inline: true,
      });
      inputs.push({
        name: fctx.t('roleUpdate.colorAfter'),
        value: colorHex(event.colorAfter),
        inline: true,
      });
    }
    if (event.hoistBefore !== event.hoistAfter) {
      inputs.push({
        name: fctx.t('roleUpdate.hoistBefore'),
        value: boolLabel(event.hoistBefore, fctx),
        inline: true,
      });
      inputs.push({
        name: fctx.t('roleUpdate.hoistAfter'),
        value: boolLabel(event.hoistAfter, fctx),
        inline: true,
      });
    }
    if (event.mentionableBefore !== event.mentionableAfter) {
      inputs.push({
        name: fctx.t('roleUpdate.mentionableBefore'),
        value: boolLabel(event.mentionableBefore, fctx),
        inline: true,
      });
      inputs.push({
        name: fctx.t('roleUpdate.mentionableAfter'),
        value: boolLabel(event.mentionableAfter, fctx),
        inline: true,
      });
    }
    if (event.permissionsBefore !== event.permissionsAfter) {
      inputs.push({
        name: fctx.t('roleUpdate.permissionsBefore'),
        value: event.permissionsBefore,
        inline: true,
      });
      inputs.push({
        name: fctx.t('roleUpdate.permissionsAfter'),
        value: event.permissionsAfter,
        inline: true,
      });
    }
  }
  const { fields, attachments } = fieldOrAttachment(inputs);
  const embed: UIEmbed = {
    title: fctx.t('roleUpdate.title'),
    description: fctx.t('roleUpdate.description', { roleId: event.roleId }),
    color: colorForEventType('guild.roleUpdate'),
    timestamp: new Date(event.updatedAt).toISOString(),
    footer: footerFor(new Date(event.updatedAt)),
    fields,
  };
  return { embed, attachments };
};
