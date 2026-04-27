import type { GuildRoleCreateEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatRoleCreate } from '../../../src/formatters/role-create.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const event: GuildRoleCreateEvent = {
  type: 'guild.roleCreate',
  guildId: 'g1' as never,
  roleId: 'r1' as never,
  createdAt: Date.UTC(2026, 3, 23, 14, 32, 0),
};

describe('formatRoleCreate', () => {
  it('produit un embed violet avec titre et description', () => {
    const result = formatRoleCreate(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x9b59b6);
    expect(result.embed.title).toBe('roleCreate.title');
    expect(result.embed.description).toBe('roleCreate.description');
    expect(result.attachments).toHaveLength(0);
  });

  it('porte un timestamp ISO aligné sur createdAt', () => {
    const result = formatRoleCreate(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.timestamp).toBe(new Date(event.createdAt).toISOString());
  });
});
