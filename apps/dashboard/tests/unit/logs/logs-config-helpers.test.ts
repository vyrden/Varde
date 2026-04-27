import { describe, expect, it } from 'vitest';

import type { LogsConfigClient, LogsRouteClient } from '../../../components/logs/LogsConfigEditor';
import {
  additionalRoutes,
  buildRoutesForSave,
  countRedirectedEvents,
  extractSimpleRoute,
  isAdvancedConfig,
  SIMPLE_ROUTE_ID,
} from '../../../components/logs/logs-config-helpers';

const SIMPLE_ROUTE: LogsRouteClient = {
  id: SIMPLE_ROUTE_ID,
  label: 'Logs',
  events: ['guild.memberJoin', 'guild.memberLeave'],
  channelId: 'C-SIMPLE',
  verbosity: 'detailed',
};

const EXTRA_ROUTE: LogsRouteClient = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Modération',
  events: ['guild.messageDelete'],
  channelId: 'C-MOD',
  verbosity: 'detailed',
};

const EMPTY_EXCLUSIONS = {
  userIds: [],
  roleIds: [],
  channelIds: [],
  excludeBots: false,
} as const;

describe('additionalRoutes', () => {
  it('filtre la simple-route', () => {
    expect(additionalRoutes([SIMPLE_ROUTE, EXTRA_ROUTE])).toEqual([EXTRA_ROUTE]);
  });

  it('retourne tableau vide si seule la simple-route existe', () => {
    expect(additionalRoutes([SIMPLE_ROUTE])).toEqual([]);
  });

  it('préserve l’ordre relatif', () => {
    const r1 = { ...EXTRA_ROUTE, id: 'aaa' };
    const r2 = { ...EXTRA_ROUTE, id: 'bbb' };
    expect(additionalRoutes([r1, SIMPLE_ROUTE, r2])).toEqual([r1, r2]);
  });
});

describe('extractSimpleRoute', () => {
  it('retourne la simple-route présente', () => {
    const config: LogsConfigClient = {
      version: 1,
      routes: [EXTRA_ROUTE, SIMPLE_ROUTE],
      exclusions: EMPTY_EXCLUSIONS,
    };
    expect(extractSimpleRoute(config)).toEqual(SIMPLE_ROUTE);
  });

  it('retourne null si absente', () => {
    const config: LogsConfigClient = {
      version: 1,
      routes: [EXTRA_ROUTE],
      exclusions: EMPTY_EXCLUSIONS,
    };
    expect(extractSimpleRoute(config)).toBeNull();
  });
});

describe('buildRoutesForSave', () => {
  it('upsert la simple-route quand channelId + events fournis', () => {
    const result = buildRoutesForSave([EXTRA_ROUTE], 'C-SIMPLE', ['guild.memberJoin']);
    expect(result).toHaveLength(2);
    const simple = result.find((r) => r.id === SIMPLE_ROUTE_ID);
    expect(simple).toBeDefined();
    expect(simple?.channelId).toBe('C-SIMPLE');
    expect(simple?.events).toEqual(['guild.memberJoin']);
  });

  it('exclut la simple-route quand channelId vide', () => {
    const result = buildRoutesForSave([EXTRA_ROUTE], '', ['guild.memberJoin']);
    expect(result).toEqual([EXTRA_ROUTE]);
  });

  it('exclut la simple-route quand events vide', () => {
    const result = buildRoutesForSave([EXTRA_ROUTE], 'C-SIMPLE', []);
    expect(result).toEqual([EXTRA_ROUTE]);
  });

  it('préserve les routes additionnelles passées telles quelles', () => {
    const result = buildRoutesForSave([EXTRA_ROUTE], 'C-SIMPLE', ['guild.memberJoin']);
    expect(result.find((r) => r.id === EXTRA_ROUTE.id)).toEqual(EXTRA_ROUTE);
  });
});

describe('isAdvancedConfig', () => {
  it('false sur config vierge', () => {
    expect(isAdvancedConfig({ version: 1, routes: [], exclusions: EMPTY_EXCLUSIONS })).toBe(false);
  });

  it('false avec uniquement la simple-route', () => {
    expect(
      isAdvancedConfig({
        version: 1,
        routes: [SIMPLE_ROUTE],
        exclusions: EMPTY_EXCLUSIONS,
      }),
    ).toBe(false);
  });

  it('false même avec excludeBots=true (option simple, pas avancée)', () => {
    expect(
      isAdvancedConfig({
        version: 1,
        routes: [SIMPLE_ROUTE],
        exclusions: { ...EMPTY_EXCLUSIONS, excludeBots: true },
      }),
    ).toBe(false);
  });

  it('true dès une route additionnelle', () => {
    expect(
      isAdvancedConfig({
        version: 1,
        routes: [SIMPLE_ROUTE, EXTRA_ROUTE],
        exclusions: EMPTY_EXCLUSIONS,
      }),
    ).toBe(true);
  });

  it('true dès un userId exclu', () => {
    expect(
      isAdvancedConfig({
        version: 1,
        routes: [SIMPLE_ROUTE],
        exclusions: { ...EMPTY_EXCLUSIONS, userIds: ['1234567890123456789'] },
      }),
    ).toBe(true);
  });

  it('true dès un roleId exclu', () => {
    expect(
      isAdvancedConfig({
        version: 1,
        routes: [SIMPLE_ROUTE],
        exclusions: { ...EMPTY_EXCLUSIONS, roleIds: ['1234567890123456789'] },
      }),
    ).toBe(true);
  });

  it('true dès un channelId exclu', () => {
    expect(
      isAdvancedConfig({
        version: 1,
        routes: [SIMPLE_ROUTE],
        exclusions: { ...EMPTY_EXCLUSIONS, channelIds: ['1234567890123456789'] },
      }),
    ).toBe(true);
  });
});

describe('countRedirectedEvents', () => {
  it('retourne 0 sans routes additionnelles', () => {
    expect(countRedirectedEvents([SIMPLE_ROUTE])).toBe(0);
  });

  it('compte les events distincts des routes additionnelles', () => {
    const r1 = {
      ...EXTRA_ROUTE,
      id: 'aaa',
      events: ['guild.memberJoin', 'guild.memberLeave'],
    };
    const r2 = { ...EXTRA_ROUTE, id: 'bbb', events: ['guild.memberLeave', 'guild.messageDelete'] };
    expect(countRedirectedEvents([SIMPLE_ROUTE, r1, r2])).toBe(3);
  });
});
