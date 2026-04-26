import { manifestStaticSchema } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { resolveConfig } from '../../src/config.js';
import { helloWorld } from '../../src/index.js';
import { locales } from '../../src/locales.js';
import { manifest } from '../../src/manifest.js';

describe('helloWorld — manifeste', () => {
  it('passe la validation du meta-schema Zod', () => {
    expect(() => manifestStaticSchema.parse(manifest)).not.toThrow();
  });

  it('déclare la permission hello-world.ping au niveau member', () => {
    expect(manifest.permissions).toHaveLength(1);
    expect(manifest.permissions[0]).toMatchObject({
      id: 'hello-world.ping',
      defaultLevel: 'member',
    });
  });

  it('écoute guild.memberJoin et n émet aucun événement custom en V1', () => {
    expect(manifest.events.listen).toEqual(['guild.memberJoin']);
    expect(manifest.events.emit).toEqual([]);
  });
});

describe('helloWorld — définition runtime', () => {
  it('est figée par defineModule (Object.freeze)', () => {
    expect(Object.isFrozen(helloWorld)).toBe(true);
  });

  it('expose la commande /ping avec permission par défaut', () => {
    const ping = helloWorld.commands?.ping;
    expect(ping?.name).toBe('ping');
    expect(ping?.defaultPermission).toBe('hello-world.ping');
  });

  it('a un onLoad et un onUnload (nettoyage des souscriptions EventBus)', () => {
    expect(typeof helloWorld.onLoad).toBe('function');
    expect(typeof helloWorld.onUnload).toBe('function');
    expect(helloWorld.onEnable).toBeUndefined();
    expect(helloWorld.onDisable).toBeUndefined();
  });
});

describe('helloWorld — config déclarative', () => {
  it('expose configSchema et configUi', () => {
    expect(helloWorld.configSchema).toBeDefined();
    expect(helloWorld.configUi?.fields).toHaveLength(1);
    expect(helloWorld.configUi?.fields[0]).toMatchObject({
      path: 'welcomeDelayMs',
      widget: 'number',
    });
  });

  it('resolveConfig applique le défaut 300 quand le raw est null', () => {
    expect(resolveConfig(null).welcomeDelayMs).toBe(300);
  });

  it('resolveConfig applique le défaut quand le sous-objet module est vide', () => {
    expect(resolveConfig({ modules: {} }).welcomeDelayMs).toBe(300);
    expect(resolveConfig({ modules: { 'hello-world': {} } }).welcomeDelayMs).toBe(300);
  });

  it('resolveConfig extrait la valeur du bon sous-objet', () => {
    const raw = { modules: { 'hello-world': { welcomeDelayMs: 1500 } } };
    expect(resolveConfig(raw).welcomeDelayMs).toBe(1500);
  });

  it('resolveConfig rejette une valeur hors bornes via le schéma Zod', () => {
    const raw = { modules: { 'hello-world': { welcomeDelayMs: -1 } } };
    expect(() => resolveConfig(raw)).toThrow();
  });
});

describe('helloWorld — locales', () => {
  it('couvre fr et en avec les mêmes clés', () => {
    const frKeys = Object.keys(locales.fr).sort();
    const enKeys = Object.keys(locales.en).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('ping.pong existe dans les deux locales', () => {
    expect(locales.fr['ping.pong']).toBe('pong');
    expect(locales.en['ping.pong']).toBe('pong');
  });

  it('welcome.greeting contient le placeholder {userId}', () => {
    expect(locales.fr['welcome.greeting']).toContain('{userId}');
    expect(locales.en['welcome.greeting']).toContain('{userId}');
  });
});
