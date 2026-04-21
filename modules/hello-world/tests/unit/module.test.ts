import { manifestStaticSchema } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

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

  it('a un onLoad défini (pas d onEnable/onDisable/onUnload en V1)', () => {
    expect(typeof helloWorld.onLoad).toBe('function');
    expect(helloWorld.onEnable).toBeUndefined();
    expect(helloWorld.onDisable).toBeUndefined();
    expect(helloWorld.onUnload).toBeUndefined();
  });
});

describe('helloWorld — locales', () => {
  it('couvre fr et en avec les mêmes clés', () => {
    const frKeys = Object.keys(locales.fr).sort();
    const enKeys = Object.keys(locales.en).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('ping.pong existe dans les deux locales', () => {
    expect(locales.fr['ping.pong']).toBe('Pong !');
    expect(locales.en['ping.pong']).toBe('Pong!');
  });

  it('welcome.greeting contient le placeholder {userId}', () => {
    expect(locales.fr['welcome.greeting']).toContain('{userId}');
    expect(locales.en['welcome.greeting']).toContain('{userId}');
  });
});
