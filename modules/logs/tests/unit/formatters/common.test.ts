import { DISCORD_EMBED_FIELD_VALUE_LIMIT, type UIEmbedField } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import {
  colorForEventType,
  fieldOrAttachment,
  footerFor,
  truncateField,
} from '../../../src/formatters/common.js';

describe('truncateField', () => {
  it('laisse passer une valeur <= 1024 chars', () => {
    const result = truncateField('Auteur', 'x'.repeat(500));
    expect(result.kind).toBe('inline');
    if (result.kind !== 'inline') throw new Error('guard');
    expect(result.field.value.length).toBe(500);
  });

  it('déplace une valeur > 1024 chars en pièce jointe', () => {
    const bigValue = 'x'.repeat(DISCORD_EMBED_FIELD_VALUE_LIMIT + 1);
    const result = truncateField('Contenu', bigValue, { filename: 'content.txt' });
    expect(result.kind).toBe('attachment');
    if (result.kind !== 'attachment') throw new Error('guard');
    expect(result.attachment.filename).toBe('content.txt');
    expect(result.attachment.data.toString('utf-8').length).toBe(bigValue.length);
    expect(result.placeholderField.value).toMatch(/voir la pièce jointe/i);
  });
});

describe('fieldOrAttachment', () => {
  it('retourne { fields, attachments } aggregat pour plusieurs champs (certains en pj)', () => {
    const bigContent = 'x'.repeat(2000);
    const result = fieldOrAttachment([
      { name: 'Auteur', value: '<@1>' },
      { name: 'Contenu', value: bigContent, attachmentFilename: 'content.txt' },
    ]);
    expect(result.fields).toHaveLength(2);
    const contentField = result.fields.find((f: UIEmbedField) => f.name === 'Contenu');
    expect(contentField?.value).toMatch(/voir la pièce jointe/i);
    expect(result.attachments).toHaveLength(1);
  });
});

describe('colorForEventType', () => {
  it('mappe les 4 events pilotes sur leurs couleurs documentées (spec)', () => {
    expect(colorForEventType('guild.memberJoin')).toBe(0x2ecc71);
    expect(colorForEventType('guild.memberLeave')).toBe(0xe74c3c);
    expect(colorForEventType('guild.messageDelete')).toBe(0xc0392b);
    expect(colorForEventType('guild.messageEdit')).toBe(0xe67e22);
  });

  it('retourne la couleur par défaut pour un event inconnu', () => {
    expect(colorForEventType('guild.unknown')).toBe(0x7289da);
  });
});

describe('footerFor', () => {
  it('construit "Varde · <ISO>"', () => {
    const footer = footerFor(new Date('2026-04-23T14:32:00.000Z'));
    expect(footer.text).toMatch(/Varde ·/);
    expect(footer.text).toContain('2026-04-23');
  });
});
