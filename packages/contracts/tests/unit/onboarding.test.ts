import { describe, expect, it } from 'vitest';

import {
  draftChannelSchema,
  draftRoleSchema,
  onboardingDraftSchema,
} from '../../src/onboarding.js';

describe('onboardingDraftSchema', () => {
  it('accepte un draft vide avec défauts explicites', () => {
    const parsed = onboardingDraftSchema.parse({});
    expect(parsed.locale).toBe('fr');
    expect(parsed.roles).toEqual([]);
    expect(parsed.categories).toEqual([]);
    expect(parsed.channels).toEqual([]);
    expect(parsed.modules).toEqual([]);
  });

  it('valide un draft complet avec un rôle + salon + config module', () => {
    const parsed = onboardingDraftSchema.parse({
      locale: 'en',
      roles: [
        {
          localId: 'role-mod',
          name: 'Moderator',
          color: 0xff0000,
          permissionPreset: 'moderator-full',
          hoist: true,
          mentionable: false,
        },
      ],
      categories: [{ localId: 'cat-general', name: 'General', position: 0 }],
      channels: [
        {
          localId: 'chan-rules',
          categoryLocalId: 'cat-general',
          name: 'rules',
          type: 'text',
          topic: 'Server rules',
          slowmodeSeconds: 0,
          readableBy: [],
          writableBy: ['role-mod'],
        },
      ],
      modules: [{ moduleId: 'hello-world', enabled: true, config: { welcomeDelayMs: 500 } }],
    });
    expect(parsed.roles).toHaveLength(1);
    expect(parsed.roles[0]?.permissionPreset).toBe('moderator-full');
    expect(parsed.modules[0]?.config).toEqual({ welcomeDelayMs: 500 });
  });

  it('rejette un permissionPreset inconnu', () => {
    expect(() =>
      draftRoleSchema.parse({
        localId: 'r',
        name: 'R',
        // biome-ignore lint/suspicious/noExplicitAny: test d intention
        permissionPreset: 'custom' as any,
      }),
    ).toThrow();
  });

  it('rejette un channel type hors enum', () => {
    expect(() =>
      draftChannelSchema.parse({
        localId: 'c',
        categoryLocalId: null,
        name: 'general',
        // biome-ignore lint/suspicious/noExplicitAny: test d intention
        type: 'stage' as any,
      }),
    ).toThrow();
  });

  it('borne slowmode à [0, 21600]', () => {
    expect(() =>
      draftChannelSchema.parse({
        localId: 'c',
        categoryLocalId: null,
        name: 'general',
        type: 'text',
        slowmodeSeconds: 30_000,
      }),
    ).toThrow();
  });

  it('accepte color 0 et color 0xFFFFFF aux bornes', () => {
    expect(() => draftRoleSchema.parse({ localId: 'r', name: 'R', color: 0 })).not.toThrow();
    expect(() => draftRoleSchema.parse({ localId: 'r', name: 'R', color: 0xffffff })).not.toThrow();
    expect(() => draftRoleSchema.parse({ localId: 'r', name: 'R', color: 0xffffff + 1 })).toThrow();
  });
});
