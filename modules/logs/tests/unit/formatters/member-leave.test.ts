import type { GuildMemberLeaveEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatMemberLeave } from '../../../src/formatters/member-leave.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

describe('formatMemberLeave', () => {
  const event: GuildMemberLeaveEvent = {
    type: 'guild.memberLeave',
    guildId: 'g1' as never,
    userId: 'u1' as never,
    leftAt: Date.UTC(2026, 3, 23, 14, 32, 0),
  };

  it('produit un embed rouge avec titre traduit', () => {
    const result = formatMemberLeave(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0xe74c3c);
    expect(result.embed.title).toBe('memberLeave.title');
    expect(result.attachments).toHaveLength(0);
  });

  it('a 1 field (auteur) dans les deux verbosités', () => {
    const compact = formatMemberLeave(event, { t: mockT, verbosity: 'compact' });
    const detailed = formatMemberLeave(event, { t: mockT, verbosity: 'detailed' });
    expect(compact.embed.fields).toHaveLength(1);
    expect(detailed.embed.fields).toHaveLength(1);
  });
});
