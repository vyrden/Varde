import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineModule } from '../../src/module.js';

const baseManifest = {
  id: 'hello-world',
  name: 'Hello World',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description: 'Module témoin.',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 1,
  permissions: [
    {
      id: 'hello-world.ping',
      category: 'utility',
      defaultLevel: 'member',
      description: 'Permet d appeler /ping.',
    },
  ],
  events: {
    listen: ['guild.memberJoin'],
    emit: ['hello-world.greeted'],
  },
};

describe('defineModule', () => {
  it('accepte un module minimal et renvoie la définition figée', () => {
    const module = defineModule({ manifest: baseManifest });
    expect(module.manifest.id).toBe('hello-world');
    expect(() => {
      // @ts-expect-error tentative de mutation sur un objet gelé
      module.manifest = { ...baseManifest, id: 'other' };
    }).toThrow();
  });

  it('accepte tous les hooks de cycle de vie', () => {
    const module = defineModule({
      manifest: baseManifest,
      onLoad: async () => undefined,
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      onUnload: async () => undefined,
    });
    expect(typeof module.onLoad).toBe('function');
    expect(typeof module.onEnable).toBe('function');
    expect(typeof module.onDisable).toBe('function');
    expect(typeof module.onUnload).toBe('function');
  });

  it('préserve les queries typées', () => {
    const pingSchema = z.object({ ping: z.literal(true) });
    const pongSchema = z.object({ pong: z.literal(true) });
    const module = defineModule({
      manifest: baseManifest,
      queries: {
        ping: {
          schema: pingSchema,
          resultSchema: pongSchema,
          handler: () => ({ pong: true as const }),
        },
      },
    });
    expect(module.queries?.ping).toBeDefined();
    expect(module.queries?.ping?.handler({ ping: true })).toEqual({ pong: true });
  });

  it('rejette un manifeste sans préfixe conforme pour events.emit', () => {
    expect(() =>
      defineModule({
        manifest: {
          ...baseManifest,
          events: {
            listen: [],
            emit: ['moderation.ban.issued'],
          },
        },
      }),
    ).toThrow(/préfixe/);
  });

  it('rejette un manifeste invalide au niveau du meta-schema Zod', () => {
    expect(() =>
      defineModule({
        manifest: {
          ...baseManifest,
          id: 'INVALID',
        },
      }),
    ).toThrow();
  });

  it('accepte un configSchema et ses defaults', () => {
    const configSchema = z.object({ threshold: z.number().int().min(0) });
    const module = defineModule({
      manifest: baseManifest,
      configSchema,
      configDefaults: { threshold: 5 },
    });
    expect(module.configDefaults?.threshold).toBe(5);
  });
});

describe('defineModule — configUi', () => {
  it('accepte un configUi bien formé et cohérent avec configSchema', () => {
    const module = defineModule({
      manifest: baseManifest,
      configSchema: z.object({
        welcomeDelayMs: z.number().int().min(0),
      }),
      configUi: {
        fields: [
          {
            path: 'welcomeDelayMs',
            label: 'Délai d accueil (ms)',
            widget: 'number',
          },
        ],
      },
    });
    expect(module.configUi?.fields).toHaveLength(1);
  });

  it('accepte un configUi sans configSchema (rendu sans validation Zod)', () => {
    const module = defineModule({
      manifest: baseManifest,
      configUi: {
        fields: [{ path: 'any', label: 'Any', widget: 'text' }],
      },
    });
    expect(module.configUi?.fields[0]?.path).toBe('any');
  });

  it('rejette un configUi mal formé (widget inconnu)', () => {
    expect(() =>
      defineModule({
        manifest: baseManifest,
        configUi: {
          fields: [
            {
              path: 'x',
              label: 'X',
              // biome-ignore lint/suspicious/noExplicitAny: test délibéré d'une valeur invalide
              widget: 'unknown-widget' as any,
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('rejette un path configUi absent de configSchema (niveau racine)', () => {
    expect(() =>
      defineModule({
        manifest: baseManifest,
        configSchema: z.object({ welcomeDelayMs: z.number() }),
        configUi: {
          fields: [{ path: 'missing', label: 'Missing', widget: 'text' }],
        },
      }),
    ).toThrow(/path "missing" ne correspond/);
  });

  it('résout les paths imbriqués à travers les ZodObject', () => {
    const module = defineModule({
      manifest: baseManifest,
      configSchema: z.object({
        thresholds: z.object({
          spam: z.number().int(),
        }),
      }),
      configUi: {
        fields: [
          {
            path: 'thresholds.spam',
            label: 'Seuil spam',
            widget: 'number',
          },
        ],
      },
    });
    expect(module.configUi?.fields[0]?.path).toBe('thresholds.spam');
  });

  it('rejette un path imbriqué dont une étape intermédiaire manque', () => {
    expect(() =>
      defineModule({
        manifest: baseManifest,
        configSchema: z.object({
          thresholds: z.object({ spam: z.number() }),
        }),
        configUi: {
          fields: [{ path: 'thresholds.notThere', label: 'X', widget: 'number' }],
        },
      }),
    ).toThrow(/thresholds\.notThere/);
  });

  it('accepte un path quand configSchema est absent (check best-effort ignoré)', () => {
    const module = defineModule({
      manifest: baseManifest,
      configUi: {
        fields: [{ path: 'whatever.nested', label: 'X', widget: 'text' }],
      },
    });
    expect(module.configUi?.fields).toHaveLength(1);
  });
});
