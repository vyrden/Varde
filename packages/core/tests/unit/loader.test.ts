import {
  defineModule,
  type GuildId,
  type ModuleContext,
  type ModuleDefinition,
  ModuleError,
  type ModuleId,
  ValidationError,
} from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createPluginLoader } from '../../src/loader.js';
import { createLogger } from '../../src/logger.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const stubCtx = (ref: { id: ModuleId; version: string }): ModuleContext =>
  ({
    module: { id: ref.id, version: ref.version },
  }) as unknown as ModuleContext;

const makeManifest = (
  id: string,
  opts: {
    coreVersion?: string;
    dependencies?: readonly string[];
    optionalDependencies?: readonly string[];
    emits?: readonly string[];
  } = {},
): ModuleDefinition['manifest'] => ({
  id,
  name: id,
  version: '1.0.0',
  coreVersion: opts.coreVersion ?? '^1.0.0',
  description: `Module ${id}`,
  author: { name: 'X' },
  license: 'Apache-2.0',
  schemaVersion: 1,
  permissions: [],
  events: { listen: [], emit: opts.emits ?? [] },
  ...(opts.dependencies || opts.optionalDependencies
    ? {
        dependencies: {
          modules: (opts.dependencies ?? []) as readonly (string & {
            readonly [k: symbol]: 'ModuleId';
          })[],
          optionalModules: (opts.optionalDependencies ?? []) as readonly (string & {
            readonly [k: symbol]: 'ModuleId';
          })[],
        },
      }
    : {}),
});

describe('createPluginLoader — register()', () => {
  it('rejette un module dont coreVersion n est pas satisfait', () => {
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    const definition = defineModule({ manifest: makeManifest('mod-a', { coreVersion: '^2.0.0' }) });
    expect(() => loader.register(definition)).toThrow(ValidationError);
  });

  it('rejette un module enregistré deux fois', () => {
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    const definition = defineModule({ manifest: makeManifest('mod-a') });
    loader.register(definition);
    expect(() => loader.register(definition)).toThrow(ValidationError);
  });

  it('accepte coreVersion avec range ^1.0.0 quand le core est 1.2.3', () => {
    const loader = createPluginLoader({
      coreVersion: '1.2.3',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    const definition = defineModule({ manifest: makeManifest('mod-a', { coreVersion: '^1.0.0' }) });
    expect(() => loader.register(definition)).not.toThrow();
  });
});

describe('createPluginLoader — loadAll() ordre topologique', () => {
  it('charge les modules dans l ordre des dépendances', async () => {
    const order: string[] = [];
    const build = (id: string, deps: string[] = []) =>
      defineModule({
        manifest: makeManifest(id, { dependencies: deps }),
        onLoad: async () => {
          order.push(id);
        },
      });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(build('c', ['a', 'b']));
    loader.register(build('b', ['a']));
    loader.register(build('a'));

    await loader.loadAll();
    expect(order).toEqual(['a', 'b', 'c']);
    expect(loader.loadOrder()).toEqual(['a', 'b', 'c']);
  });

  it('détecte un cycle de dépendances', async () => {
    const build = (id: string, deps: string[]) =>
      defineModule({ manifest: makeManifest(id, { dependencies: deps }) });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(build('a', ['b']));
    loader.register(build('b', ['a']));
    await expect(loader.loadAll()).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejette une dépendance manquante', async () => {
    const definition = defineModule({
      manifest: makeManifest('a', { dependencies: ['b'] }),
    });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(definition);
    await expect(loader.loadAll()).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepte une dépendance optionnelle manquante (juste un warn)', async () => {
    const definition = defineModule({
      manifest: makeManifest('a', { optionalDependencies: ['missing'] }),
    });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(definition);
    await expect(loader.loadAll()).resolves.toBeUndefined();
  });

  it('encapsule une erreur onLoad dans un ModuleError', async () => {
    const definition = defineModule({
      manifest: makeManifest('a'),
      onLoad: () => {
        throw new Error('boom');
      },
    });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(definition);
    await expect(loader.loadAll()).rejects.toBeInstanceOf(ModuleError);
  });
});

describe('createPluginLoader — enable/disable', () => {
  const GUILD_A = '111' as GuildId;
  const GUILD_B = '222' as GuildId;

  it('enable appelle onEnable et mémorise la guild', async () => {
    const onEnable = vi.fn();
    const definition = defineModule({ manifest: makeManifest('a'), onEnable });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(definition);
    await loader.loadAll();
    await loader.enable(GUILD_A, 'a' as ModuleId);

    expect(onEnable).toHaveBeenCalledTimes(1);
    expect(loader.isEnabled('a' as ModuleId, GUILD_A)).toBe(true);
    expect(loader.isEnabled('a' as ModuleId, GUILD_B)).toBe(false);
  });

  it('enable idempotent sur la même guild', async () => {
    const onEnable = vi.fn();
    const definition = defineModule({ manifest: makeManifest('a'), onEnable });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(definition);
    await loader.loadAll();
    await loader.enable(GUILD_A, 'a' as ModuleId);
    await loader.enable(GUILD_A, 'a' as ModuleId);

    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it('enable refuse si le module n est pas chargé', async () => {
    const definition = defineModule({ manifest: makeManifest('a') });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(definition);
    await expect(loader.enable(GUILD_A, 'a' as ModuleId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('disable appelle onDisable et retire la guild', async () => {
    const onDisable = vi.fn();
    const definition = defineModule({ manifest: makeManifest('a'), onDisable });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(definition);
    await loader.loadAll();
    await loader.enable(GUILD_A, 'a' as ModuleId);
    await loader.disable(GUILD_A, 'a' as ModuleId);

    expect(onDisable).toHaveBeenCalledTimes(1);
    expect(loader.isEnabled('a' as ModuleId, GUILD_A)).toBe(false);
  });
});

describe('createPluginLoader — unloadAll', () => {
  const GUILD = '111' as GuildId;

  it('désactive les guilds puis décharge en ordre inverse', async () => {
    const order: string[] = [];
    const build = (id: string, deps: string[] = []) =>
      defineModule({
        manifest: makeManifest(id, { dependencies: deps }),
        onUnload: () => {
          order.push(`unload-${id}`);
        },
        onDisable: () => {
          order.push(`disable-${id}`);
        },
      });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(build('a'));
    loader.register(build('b', ['a']));
    await loader.loadAll();
    await loader.enable(GUILD, 'a' as ModuleId);
    await loader.enable(GUILD, 'b' as ModuleId);

    await loader.unloadAll();
    expect(order).toEqual(['disable-b', 'disable-a', 'unload-b', 'unload-a']);
  });

  it('un onUnload qui jette est logué sans bloquer le reste', async () => {
    const build = (id: string, options: { unloadError?: boolean } = {}) =>
      defineModule({
        manifest: makeManifest(id),
        onUnload: () => {
          if (options.unloadError) throw new Error(`${id} failed`);
        },
      });
    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger: silentLogger(),
      ctxFactory: stubCtx,
    });
    loader.register(build('a', { unloadError: true }));
    loader.register(build('b'));
    await loader.loadAll();

    await expect(loader.unloadAll()).resolves.toBeUndefined();
    expect(loader.isLoaded('a' as ModuleId)).toBe(false);
    expect(loader.isLoaded('b' as ModuleId)).toBe(false);
  });
});
