import type { GuildChannelDeleteEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatChannelDelete } from '../../../src/formatters/channel-delete.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const event: GuildChannelDeleteEvent = {
  type: 'guild.channelDelete',
  guildId: 'g1' as never,
  channelId: 'c1' as never,
  deletedAt: Date.UTC(2026, 3, 23, 14, 32, 0),
};

describe('formatChannelDelete', () => {
  it('produit un embed rouge très foncé avec titre et description', () => {
    const result = formatChannelDelete(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x992d22);
    expect(result.embed.title).toBe('channelDelete.title');
    expect(result.embed.description).toBe('channelDelete.description');
    expect(result.attachments).toHaveLength(0);
  });

  it('porte un timestamp ISO aligné sur deletedAt', () => {
    const result = formatChannelDelete(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.timestamp).toBe(new Date(event.deletedAt).toISOString());
  });
});
