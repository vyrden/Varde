import type { Authenticator } from '@varde/api';
import type { GuildId, UserId } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createServer, type ServerHandle } from '../../src/server.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as { userId: string };
  } catch {
    return null;
  }
};

describe('createServer — monolith composition', () => {
  let handle: ServerHandle<'sqlite'>;

  beforeEach(async () => {
    handle = await createServer({
      database: { driver: 'sqlite', url: ':memory:' },
      api: {
        authenticator: headerAuthenticator,
        version: '0.0.0-test',
      },
      logger: silentLogger(),
    });
  });

  afterEach(async () => {
    await handle.stop();
  });

  it('construit une API qui répond à /health sans listen()', async () => {
    const response = await handle.api.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', version: '0.0.0-test' });
  });

  it('expose le loader, commandRegistry, config, permissions, eventBus', () => {
    expect(typeof handle.loader.register).toBe('function');
    expect(typeof handle.commandRegistry.register).toBe('function');
    expect(typeof handle.config.get).toBe('function');
    expect(typeof handle.permissions.can).toBe('function');
    expect(typeof handle.eventBus.emit).toBe('function');
    expect(typeof handle.dispatcher.dispatchCommand).toBe('function');
  });

  it('applique les migrations de la DB au démarrage', async () => {
    // Un insert dans `guilds` ne peut passer que si la table existe.
    handle.client.db.insert(sqliteSchema.guilds).values({ id: '111', name: 'Alpha' }).run();
    const rows = handle.client.db.select().from(sqliteSchema.guilds).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Alpha');
  });

  it('stop() est idempotent et ferme proprement', async () => {
    await expect(handle.stop()).resolves.toBeUndefined();
    await expect(handle.stop()).resolves.toBeUndefined();
  });
});

describe('createServer — API + authenticator', () => {
  it('authenticator partagé : /me renvoie la session depuis x-test-session', async () => {
    const handle = await createServer({
      database: { driver: 'sqlite', url: ':memory:' },
      api: { authenticator: headerAuthenticator, version: 'x' },
      logger: silentLogger(),
    });
    try {
      const anonymous = await handle.api.inject({ method: 'GET', url: '/me' });
      expect(anonymous.statusCode).toBe(401);

      const authed = await handle.api.inject({
        method: 'GET',
        url: '/me',
        headers: { 'x-test-session': JSON.stringify({ userId: '42' }) },
      });
      expect(authed.statusCode).toBe(200);
      expect(authed.json()).toEqual({ userId: '42' });
    } finally {
      await handle.stop();
    }
  });
});

describe('createServer — audit subscriber', () => {
  it('écrit core.config.updated dans l audit à chaque setWith (acteur user)', async () => {
    const handle = await createServer({
      database: { driver: 'sqlite', url: ':memory:' },
      api: { authenticator: headerAuthenticator, version: 'x' },
      logger: silentLogger(),
    });
    try {
      handle.client.db.insert(sqliteSchema.guilds).values({ id: '111', name: 'Alpha' }).run();

      await handle.config.setWith(
        '111' as GuildId,
        { modules: { 'hello-world': { welcomeDelayMs: 700 } } },
        { scope: 'modules.hello-world', updatedBy: '42' as UserId },
      );

      const rows = await handle.audit.query({ guildId: '111' as GuildId, limit: 10 });
      const entry = rows.find((r) => r.action === 'core.config.updated');
      expect(entry).toBeDefined();
      expect(entry?.actorType).toBe('user');
      expect(entry?.actorId).toBe('42');
      expect(entry?.severity).toBe('info');
      expect(entry?.metadata).toMatchObject({
        scope: 'modules.hello-world',
        versionBefore: 0,
        versionAfter: 1,
      });
    } finally {
      await handle.stop();
    }
  });

  it('retombe sur actorType=system quand updatedBy est null', async () => {
    const handle = await createServer({
      database: { driver: 'sqlite', url: ':memory:' },
      api: { authenticator: headerAuthenticator, version: 'x' },
      logger: silentLogger(),
    });
    try {
      handle.client.db.insert(sqliteSchema.guilds).values({ id: '222', name: 'Beta' }).run();

      await handle.config.setWith('222' as GuildId, { foo: 1 }, { scope: 'core' });

      const rows = await handle.audit.query({ guildId: '222' as GuildId, limit: 10 });
      const entry = rows.find((r) => r.action === 'core.config.updated');
      expect(entry).toBeDefined();
      expect(entry?.actorType).toBe('system');
      expect(entry?.actorId).toBeNull();
      expect(entry?.metadata).toMatchObject({ scope: 'core' });
    } finally {
      await handle.stop();
    }
  });
});
