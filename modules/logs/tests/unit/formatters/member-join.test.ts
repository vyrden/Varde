import type { GuildMemberJoinEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatMemberJoin } from '../../../src/formatters/member-join.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

describe('formatMemberJoin', () => {
  const event: GuildMemberJoinEvent = {
    type: 'guild.memberJoin',
    guildId: 'g1' as never,
    userId: 'u1' as never,
    joinedAt: Date.UTC(2026, 3, 23, 14, 32, 0),
  };

  it('produit un embed vert avec auteur et titre traduit (compact)', () => {
    const result = formatMemberJoin(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x2ecc71);
    expect(result.embed.title).toBe('memberJoin.title');
    expect(result.embed.fields).toBeDefined();
    expect(result.attachments).toHaveLength(0);
  });

  it('produit plus de fields en verbosity detailed', () => {
    const compact = formatMemberJoin(event, { t: mockT, verbosity: 'compact' });
    const detailed = formatMemberJoin(event, { t: mockT, verbosity: 'detailed' });
    expect((detailed.embed.fields ?? []).length).toBeGreaterThanOrEqual(
      (compact.embed.fields ?? []).length,
    );
  });

  it('include inviterId dans detailed si présent', () => {
    const withInviter: GuildMemberJoinEvent = { ...event, inviterId: 'inv-1' as never };
    const result = formatMemberJoin(withInviter, { t: mockT, verbosity: 'detailed' });
    const flattenedFieldValues = (result.embed.fields ?? []).map((f) => f.value).join(' ');
    expect(flattenedFieldValues).toContain('inv-1');
  });
});
