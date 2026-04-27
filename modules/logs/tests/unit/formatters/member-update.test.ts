import type { GuildMemberUpdateEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatMemberUpdate } from '../../../src/formatters/member-update.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const baseEvent: GuildMemberUpdateEvent = {
  type: 'guild.memberUpdate',
  guildId: 'g1' as never,
  userId: 'u1' as never,
  rolesAdded: [],
  rolesRemoved: [],
  nickBefore: null,
  nickAfter: null,
  updatedAt: Date.UTC(2026, 3, 23, 14, 32, 0),
};

describe('formatMemberUpdate', () => {
  it('produit un embed bleu avec titre et description i18n', () => {
    const result = formatMemberUpdate(baseEvent, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x3498db);
    expect(result.embed.title).toBe('memberUpdate.title');
    expect(result.embed.description).toBe('memberUpdate.description');
    expect(result.attachments).toHaveLength(0);
  });

  it('mode detailed ajoute le field "rôles ajoutés" quand rolesAdded non-vide', () => {
    const event: GuildMemberUpdateEvent = {
      ...baseEvent,
      rolesAdded: ['r-new' as never],
    };
    const result = formatMemberUpdate(event, { t: mockT, verbosity: 'detailed' });
    const values = (result.embed.fields ?? []).map((f) => `${f.name} ${f.value}`).join(' | ');
    expect(values).toContain('memberUpdate.rolesAdded');
    expect(values).toContain('<@&r-new>');
    expect(values).not.toContain('memberUpdate.rolesRemoved');
  });

  it('mode detailed ajoute le field "rôles retirés" quand rolesRemoved non-vide', () => {
    const event: GuildMemberUpdateEvent = {
      ...baseEvent,
      rolesRemoved: ['r-old' as never],
    };
    const result = formatMemberUpdate(event, { t: mockT, verbosity: 'detailed' });
    const values = (result.embed.fields ?? []).map((f) => `${f.name} ${f.value}`).join(' | ');
    expect(values).toContain('memberUpdate.rolesRemoved');
    expect(values).toContain('<@&r-old>');
  });

  it('mode detailed rend le diff de nickname avec bascule null → valeur', () => {
    const event: GuildMemberUpdateEvent = {
      ...baseEvent,
      nickBefore: null,
      nickAfter: 'Alice',
    };
    const result = formatMemberUpdate(event, { t: mockT, verbosity: 'detailed' });
    const values = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`).join(' | ');
    expect(values).toContain('memberUpdate.nickBefore=memberUpdate.noNick');
    expect(values).toContain('memberUpdate.nickAfter=Alice');
  });

  it("mode detailed n'ajoute aucun field diff quand rien n'a changé (edge case flag pending)", () => {
    const result = formatMemberUpdate(baseEvent, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => f.name).join(',');
    expect(names).not.toContain('memberUpdate.rolesAdded');
    expect(names).not.toContain('memberUpdate.rolesRemoved');
    expect(names).not.toContain('memberUpdate.nickBefore');
  });

  it('mode compact ne rend ni rolesAdded ni nick diff', () => {
    const event: GuildMemberUpdateEvent = {
      ...baseEvent,
      rolesAdded: ['r-new' as never],
      nickBefore: null,
      nickAfter: 'Alice',
    };
    const result = formatMemberUpdate(event, { t: mockT, verbosity: 'compact' });
    const names = (result.embed.fields ?? []).map((f) => f.name).join(',');
    expect(names).not.toContain('memberUpdate.rolesAdded');
    expect(names).not.toContain('memberUpdate.nickBefore');
  });
});
