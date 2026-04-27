import type { GuildRoleDeleteEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatRoleDelete } from '../../../src/formatters/role-delete.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const event: GuildRoleDeleteEvent = {
  type: 'guild.roleDelete',
  guildId: 'g1' as never,
  roleId: 'r1' as never,
  deletedAt: Date.UTC(2026, 3, 23, 14, 32, 0),
};

describe('formatRoleDelete', () => {
  it('produit un embed violet très foncé avec titre et description', () => {
    const result = formatRoleDelete(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x6c3483);
    expect(result.embed.title).toBe('roleDelete.title');
    expect(result.embed.description).toBe('roleDelete.description');
    expect(result.attachments).toHaveLength(0);
  });

  it('porte un timestamp ISO aligné sur deletedAt', () => {
    const result = formatRoleDelete(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.timestamp).toBe(new Date(event.deletedAt).toISOString());
  });
});
