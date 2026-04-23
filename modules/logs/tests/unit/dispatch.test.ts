import type { GuildMemberJoinEvent, GuildMessageDeleteEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import type { LogsConfig } from '../../src/config.js';
import { applicableRoutes } from '../../src/dispatch.js';

const cfg = (overrides?: Partial<LogsConfig>): LogsConfig => ({
  version: 1,
  routes: [],
  exclusions: { userIds: [], roleIds: [], channelIds: [], excludeBots: true },
  ...(overrides ?? {}),
});

const memberJoin = (overrides?: Partial<GuildMemberJoinEvent>): GuildMemberJoinEvent => ({
  type: 'guild.memberJoin',
  guildId: 'g1' as never,
  userId: 'u1' as never,
  joinedAt: 0,
  ...(overrides ?? {}),
});

describe('applicableRoutes', () => {
  it("retourne [] si aucune route ne couvre l'event type", () => {
    const c = cfg({
      routes: [
        {
          id: 'r1',
          label: 'R1',
          events: ['guild.messageDelete'],
          channelId: '111',
          verbosity: 'detailed',
        },
      ],
    });
    expect(applicableRoutes(c, memberJoin(), {})).toEqual([]);
  });

  it("retourne une route qui couvre l'event", () => {
    const c = cfg({
      routes: [
        {
          id: 'r1',
          label: 'R1',
          events: ['guild.memberJoin'],
          channelId: '111',
          verbosity: 'detailed',
        },
      ],
    });
    expect(applicableRoutes(c, memberJoin(), {})).toHaveLength(1);
  });

  it('retourne N routes si plusieurs couvrent le même event (multi-fanout)', () => {
    const c = cfg({
      routes: [
        {
          id: 'r1',
          label: 'R1',
          events: ['guild.memberJoin'],
          channelId: '111',
          verbosity: 'detailed',
        },
        {
          id: 'r2',
          label: 'R2',
          events: ['guild.memberJoin', 'guild.memberLeave'],
          channelId: '222',
          verbosity: 'compact',
        },
      ],
    });
    expect(applicableRoutes(c, memberJoin(), {})).toHaveLength(2);
  });

  it('exclut un event dont le user est dans exclusions.userIds', () => {
    const c = cfg({
      routes: [
        {
          id: 'r1',
          label: 'R1',
          events: ['guild.memberJoin'],
          channelId: '111',
          verbosity: 'detailed',
        },
      ],
      exclusions: { userIds: ['u-banned'], roleIds: [], channelIds: [], excludeBots: true },
    });
    expect(applicableRoutes(c, memberJoin({ userId: 'u-banned' as never }), {})).toHaveLength(0);
  });

  it('exclut un event dont le salon source est dans exclusions.channelIds', () => {
    const c = cfg({
      routes: [
        {
          id: 'r1',
          label: 'R1',
          events: ['guild.messageDelete'],
          channelId: '111',
          verbosity: 'detailed',
        },
      ],
      exclusions: { userIds: [], roleIds: [], channelIds: ['spam'], excludeBots: true },
    });
    const event: GuildMessageDeleteEvent = {
      type: 'guild.messageDelete',
      guildId: 'g1' as never,
      channelId: 'spam' as never,
      messageId: 'm1' as never,
      authorId: 'u1' as never,
      deletedAt: 0,
    };
    expect(applicableRoutes(c, event, {})).toHaveLength(0);
  });

  it("exclut un event dont l'auteur est un bot si excludeBots=true et l'info est fournie", () => {
    const c = cfg({
      routes: [
        {
          id: 'r1',
          label: 'R1',
          events: ['guild.memberJoin'],
          channelId: '111',
          verbosity: 'detailed',
        },
      ],
    });
    expect(
      applicableRoutes(c, memberJoin({ userId: 'bot-1' as never }), {
        isBotByUserId: { 'bot-1': true },
      }),
    ).toHaveLength(0);
  });

  it("n'exclut pas les rôles (PR 4.1c ne les résout pas — placeholder pour 4.2+)", () => {
    const c = cfg({
      routes: [
        {
          id: 'r1',
          label: 'R1',
          events: ['guild.memberJoin'],
          channelId: '111',
          verbosity: 'detailed',
        },
      ],
      exclusions: { userIds: [], roleIds: ['r-bot'], channelIds: [], excludeBots: true },
    });
    expect(applicableRoutes(c, memberJoin(), {})).toHaveLength(1);
  });
});
