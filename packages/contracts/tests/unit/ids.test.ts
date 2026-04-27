import { describe, expect, it } from 'vitest';

import {
  assertGuildId,
  assertModuleId,
  isActionId,
  isChannelId,
  isGuildId,
  isMessageId,
  isModuleId,
  isPermissionId,
  isRoleId,
  isUserId,
} from '../../src/ids.js';

describe('Discord ID guards', () => {
  it('acceptent un snowflake valide (17 à 20 chiffres)', () => {
    expect(isGuildId('123456789012345678')).toBe(true);
    expect(isUserId('12345678901234567')).toBe(true);
    expect(isChannelId('12345678901234567890')).toBe(true);
    expect(isRoleId('123456789012345678')).toBe(true);
    expect(isMessageId('123456789012345678')).toBe(true);
  });

  it('refusent un snowflake trop court ou trop long', () => {
    expect(isGuildId('1234567890123456')).toBe(false);
    expect(isGuildId('123456789012345678901')).toBe(false);
  });

  it('refusent une string non-numérique', () => {
    expect(isGuildId('12345678901234567a')).toBe(false);
    expect(isGuildId('abcdefghijklmnopqr')).toBe(false);
  });

  it('refusent les non-strings', () => {
    expect(isGuildId(123)).toBe(false);
    expect(isGuildId(null)).toBe(false);
    expect(isGuildId(undefined)).toBe(false);
    expect(isGuildId({})).toBe(false);
  });

  it('assertGuildId raffine en cas de succès et lève sinon', () => {
    const id = assertGuildId('123456789012345678');
    expect(id).toBe('123456789012345678');
    expect(() => assertGuildId('invalid')).toThrow(TypeError);
  });
});

describe('ModuleId guard', () => {
  it('accepte un kebab-case simple', () => {
    expect(isModuleId('moderation')).toBe(true);
    expect(isModuleId('onboarding-presets')).toBe(true);
  });

  it('accepte un id préfixé par un auteur', () => {
    expect(isModuleId('author/module-name')).toBe(true);
    expect(isModuleId('vyrden/custom')).toBe(true);
  });

  it('refuse camelCase et PascalCase', () => {
    expect(isModuleId('moderationModule')).toBe(false);
    expect(isModuleId('ModerationModule')).toBe(false);
  });

  it('refuse underscore, point ou majuscule', () => {
    expect(isModuleId('moderation_module')).toBe(false);
    expect(isModuleId('moderation.module')).toBe(false);
    expect(isModuleId('Moderation')).toBe(false);
  });

  it('refuse les ids qui commencent par un tiret', () => {
    expect(isModuleId('-moderation')).toBe(false);
  });

  it('assertModuleId raffine et lève sur invalide', () => {
    expect(assertModuleId('mod-x')).toBe('mod-x');
    expect(() => assertModuleId('Module_X')).toThrow(TypeError);
  });
});

describe('PermissionId guard', () => {
  it('accepte un format module.action', () => {
    expect(isPermissionId('moderation.ban')).toBe(true);
    expect(isPermissionId('roles.assign')).toBe(true);
    expect(isPermissionId('hello-world.ping')).toBe(true);
  });

  it('refuse sans point', () => {
    expect(isPermissionId('moderation')).toBe(false);
  });

  it('accepte un format module.category.action (trois segments)', () => {
    expect(isPermissionId('moderation.ban.permanent')).toBe(true);
    expect(isPermissionId('logs.config.manage')).toBe(true);
  });

  it('refuse avec plus de trois segments', () => {
    expect(isPermissionId('moderation.ban.permanent.extra')).toBe(false);
  });

  it('refuse avec un segment vide', () => {
    expect(isPermissionId('.ban')).toBe(false);
    expect(isPermissionId('moderation.')).toBe(false);
  });
});

describe('ActionId guard', () => {
  it('accepte un format module.action.verb', () => {
    expect(isActionId('moderation.sanction.applied')).toBe(true);
    expect(isActionId('config.value.changed')).toBe(true);
  });

  it('refuse avec moins ou plus de trois segments', () => {
    expect(isActionId('moderation.ban')).toBe(false);
    expect(isActionId('a.b.c.d')).toBe(false);
  });
});
