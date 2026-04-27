import type { GuildChannelUpdateEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatChannelUpdate } from '../../../src/formatters/channel-update.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const AT = Date.UTC(2026, 3, 23, 14, 32, 0);

const noChangeEvent: GuildChannelUpdateEvent = {
  type: 'guild.channelUpdate',
  guildId: 'g1' as never,
  channelId: 'c1' as never,
  nameBefore: 'général',
  nameAfter: 'général',
  topicBefore: null,
  topicAfter: null,
  positionBefore: 0,
  positionAfter: 0,
  parentIdBefore: null,
  parentIdAfter: null,
  updatedAt: AT,
};

describe('formatChannelUpdate', () => {
  it('produit un embed orange doré avec titre et description', () => {
    const result = formatChannelUpdate(noChangeEvent, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0xf39c12);
    expect(result.embed.title).toBe('channelUpdate.title');
    expect(result.embed.description).toBe('channelUpdate.description');
  });

  it('mode compact ne rend aucun field', () => {
    const event: GuildChannelUpdateEvent = {
      ...noChangeEvent,
      nameBefore: 'old',
      nameAfter: 'new',
    };
    const result = formatChannelUpdate(event, { t: mockT, verbosity: 'compact' });
    expect(result.embed.fields ?? []).toHaveLength(0);
  });

  it('mode détaillé rend le diff name quand name a changé', () => {
    const event: GuildChannelUpdateEvent = {
      ...noChangeEvent,
      nameBefore: 'général',
      nameAfter: 'général-archive',
    };
    const result = formatChannelUpdate(event, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(names).toContain('channelUpdate.nameBefore=général');
    expect(names).toContain('channelUpdate.nameAfter=général-archive');
  });

  it('mode détaillé rend le diff topic avec null → valeur via noTopic', () => {
    const event: GuildChannelUpdateEvent = {
      ...noChangeEvent,
      topicBefore: null,
      topicAfter: 'Nouveau topic',
    };
    const result = formatChannelUpdate(event, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(names).toContain('channelUpdate.topicBefore=channelUpdate.noTopic');
    expect(names).toContain('channelUpdate.topicAfter=Nouveau topic');
  });

  it('mode détaillé rend le diff parent avec null → mention', () => {
    const event: GuildChannelUpdateEvent = {
      ...noChangeEvent,
      parentIdBefore: null,
      parentIdAfter: 'cat-1' as never,
    };
    const result = formatChannelUpdate(event, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(names).toContain('channelUpdate.parentBefore=channelUpdate.noParent');
    expect(names).toContain('channelUpdate.parentAfter=<#cat-1>');
  });

  it('mode détaillé rend le diff position', () => {
    const event: GuildChannelUpdateEvent = {
      ...noChangeEvent,
      positionBefore: 0,
      positionAfter: 5,
    };
    const result = formatChannelUpdate(event, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => `${f.name}=${f.value}`);
    expect(names).toContain('channelUpdate.positionBefore=0');
    expect(names).toContain('channelUpdate.positionAfter=5');
  });

  it('mode détaillé sans aucun changement détecté ne rend aucun field de diff', () => {
    const result = formatChannelUpdate(noChangeEvent, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => f.name);
    expect(names.find((n) => n.startsWith('channelUpdate.'))).toBeUndefined();
  });

  it('cumule plusieurs diffs en mode détaillé', () => {
    const event: GuildChannelUpdateEvent = {
      ...noChangeEvent,
      nameBefore: 'a',
      nameAfter: 'b',
      topicBefore: 'x',
      topicAfter: 'y',
    };
    const result = formatChannelUpdate(event, { t: mockT, verbosity: 'detailed' });
    const names = (result.embed.fields ?? []).map((f) => f.name);
    expect(names).toContain('channelUpdate.nameBefore');
    expect(names).toContain('channelUpdate.nameAfter');
    expect(names).toContain('channelUpdate.topicBefore');
    expect(names).toContain('channelUpdate.topicAfter');
  });
});
