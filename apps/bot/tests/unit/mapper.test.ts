import { parseCoreEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { type DiscordEventInput, mapDiscordEvent } from '../../src/mapper.js';

const AT = 1_700_000_000_000;

const roundTrip = (input: DiscordEventInput): unknown => {
  const mapped = mapDiscordEvent(input);
  // Le résultat doit rester valide face au schéma Zod du catalogue.
  return parseCoreEvent(mapped);
};

describe('mapDiscordEvent — membres', () => {
  it('guildMemberAdd → guild.memberJoin (inviter optionnel)', () => {
    expect(
      mapDiscordEvent({
        kind: 'guildMemberAdd',
        guildId: '111',
        userId: '42',
        joinedAt: AT,
      }),
    ).toEqual({ type: 'guild.memberJoin', guildId: '111', userId: '42', joinedAt: AT });

    expect(
      mapDiscordEvent({
        kind: 'guildMemberAdd',
        guildId: '111',
        userId: '42',
        joinedAt: AT,
        inviterId: '99',
      }),
    ).toEqual({
      type: 'guild.memberJoin',
      guildId: '111',
      userId: '42',
      joinedAt: AT,
      inviterId: '99',
    });
  });

  it('guildMemberRemove → guild.memberLeave', () => {
    expect(
      mapDiscordEvent({
        kind: 'guildMemberRemove',
        guildId: '111',
        userId: '42',
        leftAt: AT,
      }),
    ).toEqual({ type: 'guild.memberLeave', guildId: '111', userId: '42', leftAt: AT });
  });

  it('guildMemberUpdate → guild.memberUpdate avec diff de rôles et nick', () => {
    const event = mapDiscordEvent({
      kind: 'guildMemberUpdate',
      guildId: '111',
      userId: '42',
      rolesAdded: ['r1'],
      rolesRemoved: ['r2', 'r3'],
      nickBefore: 'Alice',
      nickAfter: 'Ali',
      updatedAt: AT,
    });
    expect(event).toMatchObject({
      type: 'guild.memberUpdate',
      guildId: '111',
      userId: '42',
      rolesAdded: ['r1'],
      rolesRemoved: ['r2', 'r3'],
      nickBefore: 'Alice',
      nickAfter: 'Ali',
      updatedAt: AT,
    });
  });
});

describe('mapDiscordEvent — messages', () => {
  it('messageCreate → guild.messageCreate', () => {
    const event = mapDiscordEvent({
      kind: 'messageCreate',
      guildId: '111',
      channelId: '222',
      messageId: '333',
      authorId: '42',
      content: 'salut',
      createdAt: AT,
    });
    expect(event).toEqual({
      type: 'guild.messageCreate',
      guildId: '111',
      channelId: '222',
      messageId: '333',
      authorId: '42',
      content: 'salut',
      createdAt: AT,
    });
  });

  it('messageUpdate → guild.messageEdit (contentBefore nullable)', () => {
    const event = mapDiscordEvent({
      kind: 'messageUpdate',
      guildId: '111',
      channelId: '222',
      messageId: '333',
      authorId: '42',
      contentBefore: null,
      contentAfter: 'edited',
      editedAt: AT,
    });
    expect(event).toMatchObject({
      type: 'guild.messageEdit',
      contentBefore: null,
      contentAfter: 'edited',
    });
  });

  it('messageDelete → guild.messageDelete (authorId nullable)', () => {
    const event = mapDiscordEvent({
      kind: 'messageDelete',
      guildId: '111',
      channelId: '222',
      messageId: '333',
      authorId: null,
      deletedAt: AT,
    });
    expect(event).toMatchObject({
      type: 'guild.messageDelete',
      authorId: null,
    });
  });
});

describe('mapDiscordEvent — salons, rôles, guild', () => {
  it.each([
    ['channelCreate', 'guild.channelCreate', 'createdAt'] as const,
    ['channelUpdate', 'guild.channelUpdate', 'updatedAt'] as const,
    ['channelDelete', 'guild.channelDelete', 'deletedAt'] as const,
  ])('%s → %s porte %s', (kind, type, timestampField) => {
    const event = mapDiscordEvent({
      kind,
      guildId: '111',
      channelId: '222',
      [timestampField]: AT,
    } as DiscordEventInput);
    expect(event).toMatchObject({ type, guildId: '111', channelId: '222', [timestampField]: AT });
  });

  it.each([
    ['roleCreate', 'guild.roleCreate', 'createdAt'] as const,
    ['roleUpdate', 'guild.roleUpdate', 'updatedAt'] as const,
    ['roleDelete', 'guild.roleDelete', 'deletedAt'] as const,
  ])('%s → %s porte %s', (kind, type, timestampField) => {
    const event = mapDiscordEvent({
      kind,
      guildId: '111',
      roleId: 'r1',
      [timestampField]: AT,
    } as DiscordEventInput);
    expect(event).toMatchObject({ type, guildId: '111', roleId: 'r1', [timestampField]: AT });
  });

  it('guildCreate → guild.join et guildDelete → guild.leave', () => {
    expect(mapDiscordEvent({ kind: 'guildCreate', guildId: '111', joinedAt: AT })).toEqual({
      type: 'guild.join',
      guildId: '111',
      joinedAt: AT,
    });
    expect(mapDiscordEvent({ kind: 'guildDelete', guildId: '111', leftAt: AT })).toEqual({
      type: 'guild.leave',
      guildId: '111',
      leftAt: AT,
    });
  });
});

describe('mapDiscordEvent — parité avec le schéma Zod', () => {
  it('chaque sortie passe parseCoreEvent sans erreur', () => {
    const fixtures: DiscordEventInput[] = [
      { kind: 'guildMemberAdd', guildId: '111', userId: '42', joinedAt: AT, inviterId: '99' },
      { kind: 'guildMemberRemove', guildId: '111', userId: '42', leftAt: AT },
      {
        kind: 'guildMemberUpdate',
        guildId: '111',
        userId: '42',
        rolesAdded: ['r1'],
        rolesRemoved: [],
        nickBefore: null,
        nickAfter: 'Alice',
        updatedAt: AT,
      },
      {
        kind: 'messageCreate',
        guildId: '111',
        channelId: '222',
        messageId: '333',
        authorId: '42',
        content: 'ok',
        createdAt: AT,
      },
      {
        kind: 'messageUpdate',
        guildId: '111',
        channelId: '222',
        messageId: '333',
        authorId: '42',
        contentBefore: 'a',
        contentAfter: 'b',
        editedAt: AT,
      },
      {
        kind: 'messageDelete',
        guildId: '111',
        channelId: '222',
        messageId: '333',
        authorId: null,
        deletedAt: AT,
      },
      { kind: 'channelCreate', guildId: '111', channelId: '222', createdAt: AT },
      { kind: 'channelUpdate', guildId: '111', channelId: '222', updatedAt: AT },
      { kind: 'channelDelete', guildId: '111', channelId: '222', deletedAt: AT },
      { kind: 'roleCreate', guildId: '111', roleId: 'r1', createdAt: AT },
      { kind: 'roleUpdate', guildId: '111', roleId: 'r1', updatedAt: AT },
      { kind: 'roleDelete', guildId: '111', roleId: 'r1', deletedAt: AT },
      { kind: 'guildCreate', guildId: '111', joinedAt: AT },
      { kind: 'guildDelete', guildId: '111', leftAt: AT },
    ];
    for (const input of fixtures) {
      expect(() => roundTrip(input)).not.toThrow();
    }
  });
});
