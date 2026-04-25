import { describe, expect, it } from 'vitest';

import { resolveConfig, welcomeConfigSchema } from '../../src/config.js';

const SNOWFLAKE = '111111111111111111';

describe('welcomeConfigSchema', () => {
  it('accepte une config vide et applique les valeurs par défaut', () => {
    const cfg = welcomeConfigSchema.parse({});
    expect(cfg.version).toBe(1);
    expect(cfg.welcome.enabled).toBe(false);
    expect(cfg.welcome.destination).toBe('channel');
    expect(cfg.goodbye.enabled).toBe(false);
    expect(cfg.autorole.enabled).toBe(false);
    expect(cfg.accountAgeFilter.enabled).toBe(false);
  });

  it("refuse welcome.enabled=true en mode 'channel' sans channelId", () => {
    const result = welcomeConfigSchema.safeParse({
      welcome: { enabled: true, destination: 'channel', channelId: null, message: 'Salut' },
    });
    expect(result.success).toBe(false);
  });

  it('accepte welcome.enabled=true en mode dm sans channelId', () => {
    const result = welcomeConfigSchema.safeParse({
      welcome: { enabled: true, destination: 'dm', channelId: null, message: 'Salut' },
    });
    expect(result.success).toBe(true);
  });

  it("refuse action='quarantine' sans quarantineRoleId", () => {
    const result = welcomeConfigSchema.safeParse({
      accountAgeFilter: { enabled: true, minDays: 7, action: 'quarantine', quarantineRoleId: null },
    });
    expect(result.success).toBe(false);
  });

  it('refuse plus de 10 rôles en autorole', () => {
    const result = welcomeConfigSchema.safeParse({
      autorole: { enabled: true, roleIds: Array.from({ length: 11 }, () => SNOWFLAKE) },
    });
    expect(result.success).toBe(false);
  });

  it('refuse delaySeconds négatif', () => {
    const result = welcomeConfigSchema.safeParse({
      autorole: { enabled: true, delaySeconds: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe('resolveConfig', () => {
  it('extrait depuis modules.welcome', () => {
    const cfg = resolveConfig({
      modules: {
        welcome: {
          welcome: { enabled: true, destination: 'channel', channelId: SNOWFLAKE, message: 'Hi' },
        },
      },
    });
    expect(cfg.welcome.enabled).toBe(true);
    expect(cfg.welcome.channelId).toBe(SNOWFLAKE);
  });

  it('retourne config par défaut si modules.welcome absent', () => {
    const cfg = resolveConfig({});
    expect(cfg.welcome.enabled).toBe(false);
  });
});
