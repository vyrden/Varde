import { describe, expect, it } from 'vitest';

import {
  reactionRoleEmojiSchema,
  reactionRoleMessageSchema,
  reactionRoleModeSchema,
  reactionRolePairSchema,
  reactionRolesConfigSchema,
  resolveConfig,
} from '../../src/config.js';

const SNOWFLAKE_A = '111111111111111111';
const SNOWFLAKE_B = '222222222222222222';
const SNOWFLAKE_C = '333333333333333333';

const validMessage = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Continents',
  channelId: SNOWFLAKE_A,
  messageId: SNOWFLAKE_B,
  mode: 'unique' as const,
  pairs: [{ emoji: { type: 'unicode' as const, value: '🇪🇺' }, roleId: SNOWFLAKE_C }],
};

describe('reactionRoleEmojiSchema', () => {
  it('accepte un emoji unicode', () => {
    expect(reactionRoleEmojiSchema.parse({ type: 'unicode', value: '🎉' })).toEqual({
      type: 'unicode',
      value: '🎉',
    });
  });

  it('accepte un emoji custom avec animated par défaut à false', () => {
    const parsed = reactionRoleEmojiSchema.parse({
      type: 'custom',
      id: SNOWFLAKE_A,
      name: 'rocket',
    });
    expect(parsed).toMatchObject({ animated: false });
  });

  it('refuse un emoji custom avec id non-snowflake', () => {
    expect(
      reactionRoleEmojiSchema.safeParse({ type: 'custom', id: 'abc', name: 'x' }).success,
    ).toBe(false);
  });
});

describe('reactionRoleMessageSchema', () => {
  it('accepte un message valide avec 1 paire', () => {
    expect(reactionRoleMessageSchema.parse(validMessage)).toEqual({
      ...validMessage,
      message: '',
      feedback: 'dm',
      pairs: [{ emoji: { type: 'unicode', value: '🇪🇺' }, roleId: SNOWFLAKE_C }],
    });
  });

  it('refuse 0 paire', () => {
    const bad = { ...validMessage, pairs: [] };
    expect(reactionRoleMessageSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse plus de 20 paires (limite Discord)', () => {
    const pairs = Array.from({ length: 21 }, (_, i) => ({
      emoji: { type: 'unicode' as const, value: `emoji${i}` },
      roleId: SNOWFLAKE_C,
    }));
    expect(reactionRoleMessageSchema.safeParse({ ...validMessage, pairs }).success).toBe(false);
  });

  it('refuse label vide ou > 64 chars', () => {
    expect(reactionRoleMessageSchema.safeParse({ ...validMessage, label: '' }).success).toBe(false);
    expect(
      reactionRoleMessageSchema.safeParse({ ...validMessage, label: 'a'.repeat(65) }).success,
    ).toBe(false);
  });
});

describe('reactionRolesConfigSchema — emoji uniqueness', () => {
  it('refuse deux paires avec le même emoji unicode dans un message', () => {
    const dup = {
      ...validMessage,
      pairs: [
        { emoji: { type: 'unicode' as const, value: '🎉' }, roleId: SNOWFLAKE_C },
        { emoji: { type: 'unicode' as const, value: '🎉' }, roleId: SNOWFLAKE_A },
      ],
    };
    const cfg = { version: 1, messages: [dup] };
    expect(reactionRolesConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('accepte deux paires avec le même emoji unicode dans DEUX messages différents', () => {
    const a = { ...validMessage };
    const b = {
      ...validMessage,
      id: '00000000-0000-4000-8000-000000000002',
      label: 'Autre',
      messageId: SNOWFLAKE_C,
    };
    const cfg = { version: 1, messages: [a, b] };
    expect(reactionRolesConfigSchema.safeParse(cfg).success).toBe(true);
  });
});

describe('resolveConfig', () => {
  it('retourne la config par défaut si raw est null', () => {
    expect(resolveConfig(null)).toEqual({ version: 1, messages: [] });
  });

  it('retourne la config par défaut si modules est absent', () => {
    expect(resolveConfig({})).toEqual({ version: 1, messages: [] });
  });

  it("retourne la config par défaut si modules['reaction-roles'] est absent", () => {
    expect(resolveConfig({ modules: {} })).toEqual({ version: 1, messages: [] });
  });

  it("extrait la config depuis le chemin modules['reaction-roles']", () => {
    const snap = { modules: { 'reaction-roles': { version: 1, messages: [validMessage] } } };
    expect(resolveConfig(snap).messages).toHaveLength(1);
  });

  it("ignore les données posées au top-level 'reaction-roles' (chemin incorrect)", () => {
    const wrongPath = { 'reaction-roles': { version: 1, messages: [validMessage] } };
    expect(resolveConfig(wrongPath)).toEqual({ version: 1, messages: [] });
  });
});

describe('reactionRoleModeSchema', () => {
  it('accepte les 3 modes: normal, unique, verifier', () => {
    expect(reactionRoleModeSchema.parse('normal')).toBe('normal');
    expect(reactionRoleModeSchema.parse('unique')).toBe('unique');
    expect(reactionRoleModeSchema.parse('verifier')).toBe('verifier');
  });

  it('refuse un autre mode', () => {
    expect(reactionRoleModeSchema.safeParse('other').success).toBe(false);
  });
});

describe('reactionRolePairSchema', () => {
  it('accepte une paire valide', () => {
    const pair = { emoji: { type: 'unicode' as const, value: '🎉' }, roleId: SNOWFLAKE_A };
    expect(reactionRolePairSchema.parse(pair)).toEqual(pair);
  });

  it('refuse un roleId non-snowflake', () => {
    const pair = { emoji: { type: 'unicode' as const, value: '🎉' }, roleId: 'not-a-snowflake' };
    expect(reactionRolePairSchema.safeParse(pair).success).toBe(false);
  });
});
