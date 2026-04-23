import { describe, expect, it } from 'vitest';

import { logsConfigSchema, resolveConfig } from '../../src/config.js';

describe('logsConfigSchema', () => {
  it('accepte une config vide (defaults)', () => {
    const parsed = logsConfigSchema.parse({});
    expect(parsed.version).toBe(1);
    expect(parsed.routes).toEqual([]);
    expect(parsed.exclusions).toEqual({
      userIds: [],
      roleIds: [],
      channelIds: [],
      excludeBots: true,
    });
  });

  it('accepte une route valide', () => {
    const parsed = logsConfigSchema.parse({
      version: 1,
      routes: [
        {
          id: '00000000-0000-4000-8000-000000000000',
          label: 'Modération',
          events: ['guild.messageDelete'],
          channelId: '123456789012345678',
          verbosity: 'detailed',
        },
      ],
    });
    expect(parsed.routes).toHaveLength(1);
  });

  it('refuse une route avec events vide', () => {
    expect(() =>
      logsConfigSchema.parse({
        version: 1,
        routes: [
          {
            id: '00000000-0000-4000-8000-000000000000',
            label: 'Vide',
            events: [],
            channelId: '123456789012345678',
          },
        ],
      }),
    ).toThrow();
  });

  it("refuse un channelId qui n'est pas un snowflake", () => {
    expect(() =>
      logsConfigSchema.parse({
        version: 1,
        routes: [
          {
            id: '00000000-0000-4000-8000-000000000000',
            label: 'X',
            events: ['guild.messageDelete'],
            channelId: 'not-a-snowflake',
          },
        ],
      }),
    ).toThrow();
  });

  it('resolveConfig sur raw=null retourne les defaults', () => {
    const cfg = resolveConfig(null);
    expect(cfg.routes).toEqual([]);
    expect(cfg.exclusions.excludeBots).toBe(true);
  });

  it('resolveConfig extrait la section modules.logs du guild_config', () => {
    const raw = {
      modules: {
        logs: {
          version: 1,
          routes: [
            {
              id: '00000000-0000-4000-8000-000000000000',
              label: 'Mod',
              events: ['guild.messageDelete'],
              channelId: '123456789012345678',
              verbosity: 'compact' as const,
            },
          ],
        },
      },
    };
    const cfg = resolveConfig(raw);
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.routes[0]?.verbosity).toBe('compact');
  });
});

describe('logsConfigSchema — invariants cross-field', () => {
  it('refuse une route qui cible un channelId présent dans exclusions.channelIds', () => {
    expect(() =>
      logsConfigSchema.parse({
        version: 1,
        routes: [
          {
            id: '00000000-0000-4000-8000-000000000000',
            label: 'Incohérente',
            events: ['guild.messageDelete'],
            channelId: '123456789012345678',
            verbosity: 'detailed' as const,
          },
        ],
        exclusions: {
          userIds: [],
          roleIds: [],
          channelIds: ['123456789012345678'],
          excludeBots: true,
        },
      }),
    ).toThrow(/contradiction|route.*exclu/i);
  });
});
