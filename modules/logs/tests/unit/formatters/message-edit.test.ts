import type { GuildMessageEditEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatMessageEdit } from '../../../src/formatters/message-edit.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

describe('formatMessageEdit', () => {
  const event: GuildMessageEditEvent = {
    type: 'guild.messageEdit',
    guildId: 'g1' as never,
    channelId: 'c1' as never,
    messageId: 'm1' as never,
    authorId: 'u1' as never,
    contentBefore: 'avant',
    contentAfter: 'après',
    editedAt: Date.UTC(2026, 3, 23, 14, 32, 0),
  };

  it('compact : pas de contenu, juste salon + auteur', () => {
    const result = formatMessageEdit(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0xe67e22);
    const values = (result.embed.fields ?? []).map((f) => f.value).join(' ');
    expect(values).not.toContain('avant');
    expect(values).not.toContain('après');
  });

  it('detailed : affiche contenu before + after inline', () => {
    const result = formatMessageEdit(event, { t: mockT, verbosity: 'detailed' });
    const values = (result.embed.fields ?? []).map((f) => f.value).join(' ');
    expect(values).toContain('avant');
    expect(values).toContain('après');
    expect(result.attachments).toHaveLength(0);
  });

  it('detailed + contentAfter 2000 chars : pj after.txt', () => {
    const bigEvent: GuildMessageEditEvent = { ...event, contentAfter: 'x'.repeat(2000) };
    const result = formatMessageEdit(bigEvent, { t: mockT, verbosity: 'detailed' });
    expect(result.attachments.length).toBeGreaterThanOrEqual(1);
    expect(result.attachments.some((a) => a.filename === 'after.txt')).toBe(true);
  });
});
