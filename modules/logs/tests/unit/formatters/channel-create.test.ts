import type { GuildChannelCreateEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatChannelCreate } from '../../../src/formatters/channel-create.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const event: GuildChannelCreateEvent = {
  type: 'guild.channelCreate',
  guildId: 'g1' as never,
  channelId: 'c1' as never,
  createdAt: Date.UTC(2026, 3, 23, 14, 32, 0),
};

describe('formatChannelCreate', () => {
  it('produit un embed vert-bleu avec titre et description i18n', () => {
    const result = formatChannelCreate(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x1abc9c);
    expect(result.embed.title).toBe('channelCreate.title');
    expect(result.embed.description).toBe('channelCreate.description');
    expect(result.attachments).toHaveLength(0);
  });

  it("n'ajoute pas de field en mode détaillé (payload minimal, infos dans description)", () => {
    const result = formatChannelCreate(event, { t: mockT, verbosity: 'detailed' });
    expect(result.embed.fields ?? []).toHaveLength(0);
  });

  it('porte un timestamp ISO aligné sur createdAt', () => {
    const result = formatChannelCreate(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.timestamp).toBe(new Date(event.createdAt).toISOString());
  });
});
