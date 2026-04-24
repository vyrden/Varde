import { describe, expect, it } from 'vitest';

import {
  ALL_EVENTS,
  MEMBERS_EVENTS,
  MODERATION_EVENTS,
} from '../../../components/logs/LogsSimpleMode';

describe('LogsSimpleMode — catalogues de presets', () => {
  it('preset "Tout" liste 11 events (12 events guild.* moins messageCreate, bruyant par défaut)', () => {
    const expected = [
      'guild.memberJoin',
      'guild.memberLeave',
      'guild.memberUpdate',
      'guild.messageDelete',
      'guild.messageEdit',
      'guild.channelCreate',
      'guild.channelUpdate',
      'guild.channelDelete',
      'guild.roleCreate',
      'guild.roleUpdate',
      'guild.roleDelete',
    ];
    expect([...ALL_EVENTS].sort()).toEqual(expected.slice().sort());
  });

  it('preset "Tout" exclut explicitement guild.messageCreate (opt-in via mode avancé)', () => {
    expect([...ALL_EVENTS]).not.toContain('guild.messageCreate');
  });

  it('preset "Mod" inclut memberUpdate (changements de rôles) et roleUpdate (permissions)', () => {
    expect([...MODERATION_EVENTS]).toContain('guild.memberUpdate');
    expect([...MODERATION_EVENTS]).toContain('guild.roleUpdate');
  });

  it('preset "Mod" garde messageDelete, messageEdit, memberLeave', () => {
    expect([...MODERATION_EVENTS]).toContain('guild.messageDelete');
    expect([...MODERATION_EVENTS]).toContain('guild.messageEdit');
    expect([...MODERATION_EVENTS]).toContain('guild.memberLeave');
  });

  it('preset "Mod" n\'inclut pas messageCreate (pas pertinent pour modération)', () => {
    expect([...MODERATION_EVENTS]).not.toContain('guild.messageCreate');
  });

  it('preset "Membres" inclut memberUpdate en plus de memberJoin et memberLeave', () => {
    const expected = ['guild.memberJoin', 'guild.memberLeave', 'guild.memberUpdate'];
    expect([...MEMBERS_EVENTS].sort()).toEqual(expected.slice().sort());
  });
});
