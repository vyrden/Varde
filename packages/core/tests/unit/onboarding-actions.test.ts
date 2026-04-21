import { describe, expect, it } from 'vitest';

import {
  createCategoryAction,
  createChannelAction,
  createRoleAction,
  PERMISSION_PRESET_BITS,
  patchModuleConfigAction,
} from '../../src/onboarding/actions.js';

/**
 * Tests snapshot sur les presets de permissions (R1 : aucune bitfield
 * libre exposée, chaque preset est figé et auditable). Une évolution
 * des bits d'un preset doit casser ces tests volontairement, servant
 * de checkpoint de revue.
 */
describe('PERMISSION_PRESET_BITS', () => {
  it('moderator-full expose les bits attendus (ViewChannel, SendMessages, ManageMessages, ManageChannels, ManageRoles, ModerateMembers, BanMembers, KickMembers, ReadMessageHistory)', () => {
    const expected =
      (1n << 10n) |
      (1n << 11n) |
      (1n << 13n) |
      (1n << 4n) |
      (1n << 28n) |
      (1n << 40n) |
      (1n << 2n) |
      (1n << 1n) |
      (1n << 16n);
    expect(PERMISSION_PRESET_BITS['moderator-full']).toBe(expected);
  });

  it('moderator-minimal = ViewChannel + SendMessages + ManageMessages + ModerateMembers + ReadMessageHistory', () => {
    const expected = (1n << 10n) | (1n << 11n) | (1n << 13n) | (1n << 40n) | (1n << 16n);
    expect(PERMISSION_PRESET_BITS['moderator-minimal']).toBe(expected);
  });

  it('member-default = ViewChannel + SendMessages + ReadMessageHistory + Connect + Speak', () => {
    const expected = (1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 20n) | (1n << 21n);
    expect(PERMISSION_PRESET_BITS['member-default']).toBe(expected);
  });

  it('member-restricted = ViewChannel + ReadMessageHistory seuls (pas d écriture, pas de voix)', () => {
    const expected = (1n << 10n) | (1n << 16n);
    expect(PERMISSION_PRESET_BITS['member-restricted']).toBe(expected);
  });

  it('aucun preset n inclut Administrator ou ManageGuild (garde-fou)', () => {
    const administratorBit = 1n << 3n;
    const manageGuildBit = 1n << 5n;
    for (const [name, bits] of Object.entries(PERMISSION_PRESET_BITS)) {
      expect(
        (bits & administratorBit) === 0n,
        `preset ${name} ne doit pas avoir Administrator`,
      ).toBe(true);
      expect((bits & manageGuildBit) === 0n, `preset ${name} ne doit pas avoir ManageGuild`).toBe(
        true,
      );
    }
  });
});

describe('Action definitions — contrat R8', () => {
  it('createRole : type, schema, apply, undo, canUndo présents', () => {
    expect(createRoleAction.type).toBe('core.createRole');
    expect(typeof createRoleAction.apply).toBe('function');
    expect(typeof createRoleAction.undo).toBe('function');
    expect(createRoleAction.canUndo).toBe(true);
    expect(createRoleAction.schema).toBeDefined();
  });

  it('createCategory : canUndo=true, schema valide un payload minimum', () => {
    expect(createCategoryAction.canUndo).toBe(true);
    expect(createCategoryAction.schema.parse({ name: 'Général' })).toEqual({
      name: 'Général',
      position: 0,
    });
  });

  it('createChannel : schema accepte text / voice / forum et rejette le reste', () => {
    expect(createChannelAction.schema.parse({ name: 'général' })).toEqual({
      name: 'général',
      type: 'text',
      slowmodeSeconds: 0,
    });
    expect(() => createChannelAction.schema.parse({ name: 'x', type: 'stage' as never })).toThrow();
  });

  it('patchModuleConfig : canUndo=false (config snapshot pas implémenté V1)', () => {
    expect(patchModuleConfigAction.canUndo).toBe(false);
    expect(typeof patchModuleConfigAction.undo).toBe('function');
  });
});
