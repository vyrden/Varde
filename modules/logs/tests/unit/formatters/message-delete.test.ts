import type { GuildMessageDeleteEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatMessageDelete } from '../../../src/formatters/message-delete.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

describe('formatMessageDelete', () => {
  const event: GuildMessageDeleteEvent = {
    type: 'guild.messageDelete',
    guildId: 'g1' as never,
    channelId: 'c1' as never,
    messageId: 'm1' as never,
    authorId: 'u1' as never,
    deletedAt: Date.UTC(2026, 3, 23, 14, 32, 0),
  };

  it('produit un embed rouge foncé avec salon et auteur', () => {
    const result = formatMessageDelete(event, { t: mockT, verbosity: 'detailed' });
    expect(result.embed.color).toBe(0xc0392b);
    expect(result.embed.title).toBe('messageDelete.title');
    const values = (result.embed.fields ?? []).map((f) => f.value).join(' ');
    expect(values).toContain('<#c1>');
    expect(values).toContain('<@u1>');
  });

  it('affiche `noAuthor` quand authorId est null', () => {
    const anonymous: GuildMessageDeleteEvent = { ...event, authorId: null };
    const result = formatMessageDelete(anonymous, { t: mockT, verbosity: 'detailed' });
    const values = (result.embed.fields ?? []).map((f) => f.value).join(' ');
    expect(values).toContain('messageDelete.noAuthor');
  });
});
