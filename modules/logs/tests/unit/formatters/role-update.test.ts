import type { GuildRoleUpdateEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatRoleUpdate } from '../../../src/formatters/role-update.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const AT = Date.UTC(2026, 3, 23, 14, 32, 0);

const noChangeEvent: GuildRoleUpdateEvent = {
  type: 'guild.roleUpdate',
  guildId: 'g1' as never,
  roleId: 'r1' as never,
  nameBefore: 'Membre',
  nameAfter: 'Membre',
  colorBefore: 0,
  colorAfter: 0,
  hoistBefore: false,
  hoistAfter: false,
  mentionableBefore: false,
  mentionableAfter: false,
  permissionsBefore: '0',
  permissionsAfter: '0',
  updatedAt: AT,
};

describe('formatRoleUpdate', () => {
  it('produit un embed violet foncé avec titre et description', () => {
    const result = formatRoleUpdate(noChangeEvent, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x8e44ad);
    expect(result.embed.title).toBe('roleUpdate.title');
    expect(result.embed.description).toBe('roleUpdate.description');
  });

  it('mode compact ne rend aucun field', () => {
    const event: GuildRoleUpdateEvent = { ...noChangeEvent, nameBefore: 'a', nameAfter: 'b' };
    const result = formatRoleUpdate(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.fields ?? []).toHaveLength(0);
  });

  it('mode détaillé rend le diff name', () => {
    const event: GuildRoleUpdateEvent = {
      ...noChangeEvent,
      nameBefore: 'Membre',
      nameAfter: 'Membre Vérifié',
    };
    const result = formatRoleUpdate(event, { t: mockT, verbosity: 'detailed' });
    const pairs = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(pairs).toContain('roleUpdate.nameBefore=Membre');
    expect(pairs).toContain('roleUpdate.nameAfter=Membre Vérifié');
  });

  it('mode détaillé formate la couleur en hex #RRGGBB', () => {
    const event: GuildRoleUpdateEvent = { ...noChangeEvent, colorBefore: 0, colorAfter: 0xff0000 };
    const result = formatRoleUpdate(event, { t: mockT, verbosity: 'detailed' });
    const pairs = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(pairs).toContain('roleUpdate.colorBefore=#000000');
    expect(pairs).toContain('roleUpdate.colorAfter=#ff0000');
  });

  it('mode détaillé rend hoist et mentionable en oui/non', () => {
    const event: GuildRoleUpdateEvent = {
      ...noChangeEvent,
      hoistBefore: false,
      hoistAfter: true,
      mentionableBefore: true,
      mentionableAfter: false,
    };
    const result = formatRoleUpdate(event, { t: mockT, verbosity: 'detailed' });
    const pairs = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(pairs).toContain('roleUpdate.hoistBefore=roleUpdate.no');
    expect(pairs).toContain('roleUpdate.hoistAfter=roleUpdate.yes');
    expect(pairs).toContain('roleUpdate.mentionableBefore=roleUpdate.yes');
    expect(pairs).toContain('roleUpdate.mentionableAfter=roleUpdate.no');
  });

  it('mode détaillé affiche le bitfield permissions en string brut', () => {
    const event: GuildRoleUpdateEvent = {
      ...noChangeEvent,
      permissionsBefore: '0',
      permissionsAfter: '8',
    };
    const result = formatRoleUpdate(event, { t: mockT, verbosity: 'detailed' });
    const pairs = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(pairs).toContain('roleUpdate.permissionsBefore=0');
    expect(pairs).toContain('roleUpdate.permissionsAfter=8');
  });

  it('mode détaillé sans changement ne rend aucun field de diff', () => {
    const result = formatRoleUpdate(noChangeEvent, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => f.name);
    expect(names.find((n) => n.startsWith('roleUpdate.'))).toBeUndefined();
  });
});
