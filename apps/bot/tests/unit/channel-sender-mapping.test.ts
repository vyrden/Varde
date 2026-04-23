import type { UIMessage } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { mapEmbedToDiscordJsPayload } from '../../src/channel-sender-mapper.js';

describe('mapEmbedToDiscordJsPayload', () => {
  it("produit un payload discord.js avec embed et sans fichiers si pas d'attachments", () => {
    const message: UIMessage = {
      kind: 'embed',
      payload: {
        title: 'Titre',
        description: 'Desc',
        color: 0x2ecc71,
        fields: [{ name: 'k', value: 'v', inline: true }],
      },
    };
    const payload = mapEmbedToDiscordJsPayload(message);
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]?.data.title).toBe('Titre');
    expect(payload.embeds[0]?.data.color).toBe(0x2ecc71);
    expect(payload.files).toBeUndefined();
  });

  it('produit files[] à partir des attachments', () => {
    const message: UIMessage = {
      kind: 'embed',
      payload: { title: 'T' },
      attachments: [
        {
          filename: 'content.txt',
          contentType: 'text/plain; charset=utf-8',
          data: Buffer.from('hello world', 'utf-8'),
        },
      ],
    };
    const payload = mapEmbedToDiscordJsPayload(message);
    expect(payload.files).toHaveLength(1);
    expect(payload.files?.[0]?.name).toBe('content.txt');
  });

  it('throw sur un UIMessage non-embed', () => {
    const message: UIMessage = { kind: 'success', payload: { message: 'ok' } };
    expect(() => mapEmbedToDiscordJsPayload(message)).toThrow(TypeError);
  });
});
