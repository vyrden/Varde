import { describe, expect, it } from 'vitest';

import { moderationConfigSchema, resolveConfig } from '../../src/config.js';

describe('moderation config', () => {
  it('defaults : mutedRoleId=null, dmOnSanction=true, automod vide, version=1', () => {
    const parsed = moderationConfigSchema.parse({});
    expect(parsed).toEqual({
      version: 1,
      mutedRoleId: null,
      dmOnSanction: true,
      automod: { rules: [], bypassRoleIds: [] },
      restrictedChannels: [],
    });
  });

  it('accepte un snowflake valide pour mutedRoleId', () => {
    const parsed = moderationConfigSchema.parse({ mutedRoleId: '123456789012345678' });
    expect(parsed.mutedRoleId).toBe('123456789012345678');
  });

  it('rejette un mutedRoleId qui n est pas un snowflake', () => {
    expect(() => moderationConfigSchema.parse({ mutedRoleId: 'pas-un-id' })).toThrow();
    expect(() => moderationConfigSchema.parse({ mutedRoleId: '12345' })).toThrow();
  });

  it('accepte mutedRoleId=null explicite', () => {
    const parsed = moderationConfigSchema.parse({ mutedRoleId: null });
    expect(parsed.mutedRoleId).toBeNull();
  });

  it('rejette un dmOnSanction non booléen', () => {
    expect(() => moderationConfigSchema.parse({ dmOnSanction: 'oui' })).toThrow();
  });
});

describe('resolveConfig', () => {
  it('retourne les defaults sur snapshot vide', () => {
    expect(resolveConfig({})).toEqual({
      version: 1,
      mutedRoleId: null,
      dmOnSanction: true,
      automod: { rules: [], bypassRoleIds: [] },
      restrictedChannels: [],
    });
  });

  it('retourne les defaults si la branche modules.moderation est absente', () => {
    expect(resolveConfig({ modules: {} })).toEqual({
      version: 1,
      mutedRoleId: null,
      dmOnSanction: true,
      automod: { rules: [], bypassRoleIds: [] },
      restrictedChannels: [],
    });
  });

  it('lit la config depuis modules.moderation', () => {
    const snapshot = {
      modules: {
        moderation: { mutedRoleId: '987654321098765432', dmOnSanction: false },
      },
    };
    expect(resolveConfig(snapshot)).toEqual({
      version: 1,
      mutedRoleId: '987654321098765432',
      dmOnSanction: false,
      automod: { rules: [], bypassRoleIds: [] },
      restrictedChannels: [],
    });
  });

  it('jette si modules.moderation est mal typé', () => {
    expect(() => resolveConfig({ modules: { moderation: { mutedRoleId: 'invalide' } } })).toThrow();
  });
});
