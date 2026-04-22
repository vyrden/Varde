import { describe, expect, it } from 'vitest';

import {
  DISCORD_EMBED_DESCRIPTION_LIMIT,
  DISCORD_EMBED_FIELD_NAME_LIMIT,
  DISCORD_EMBED_FIELD_VALUE_LIMIT,
  DISCORD_EMBED_FOOTER_TEXT_LIMIT,
  DISCORD_EMBED_MAX_FIELDS,
  DISCORD_EMBED_TITLE_LIMIT,
  DISCORD_EMBED_TOTAL_LIMIT,
  DISCORD_MAX_ATTACHMENT_BYTES,
  type UIAttachment,
  type UIEmbed,
  type UIEmbedAuthor,
  type UIEmbedField,
  type UIEmbedFooter,
} from '../../src/ui.js';

describe('UI embed types', () => {
  it('expose les limites Discord documentées (snapshot stable)', () => {
    expect(DISCORD_EMBED_TITLE_LIMIT).toBe(256);
    expect(DISCORD_EMBED_DESCRIPTION_LIMIT).toBe(4096);
    expect(DISCORD_EMBED_FIELD_NAME_LIMIT).toBe(256);
    expect(DISCORD_EMBED_FIELD_VALUE_LIMIT).toBe(1024);
    expect(DISCORD_EMBED_FOOTER_TEXT_LIMIT).toBe(2048);
    expect(DISCORD_EMBED_MAX_FIELDS).toBe(25);
    expect(DISCORD_EMBED_TOTAL_LIMIT).toBe(6000);
    expect(DISCORD_MAX_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it('permet de construire un UIEmbed minimal (title seul)', () => {
    const embed: UIEmbed = { title: 'Hello' };
    expect(embed.title).toBe('Hello');
  });

  it('permet de construire un UIEmbed complet', () => {
    const author: UIEmbedAuthor = { name: 'Varde', iconUrl: 'https://example/a.png' };
    const footer: UIEmbedFooter = { text: 'Varde · 2026-04-23' };
    const field: UIEmbedField = { name: 'Salon', value: '#mod-log', inline: true };
    const embed: UIEmbed = {
      title: 'Message supprimé',
      description: 'Un message a été supprimé.',
      color: 0xc0392b,
      timestamp: '2026-04-23T14:32:00.000Z',
      author,
      footer,
      fields: [field],
    };
    expect(embed.fields).toHaveLength(1);
    expect(embed.fields?.[0]?.inline).toBe(true);
  });

  it('permet de construire un UIAttachment .txt', () => {
    const attachment: UIAttachment = {
      filename: 'content.txt',
      contentType: 'text/plain; charset=utf-8',
      data: Buffer.from('hello', 'utf-8'),
    };
    expect(attachment.data.toString('utf-8')).toBe('hello');
  });
});
