import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiServer, registerAllowedHostsRoutes } from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

const ENV_BASE_URL = 'http://localhost:3000';

const build = async (
  client: DbClient<'sqlite'>,
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  instanceConfig: ReturnType<typeof createInstanceConfigService>;
}> => {
  const masterKey = randomBytes(32);
  const instanceConfig = createInstanceConfigService({
    client,
    masterKey,
    logger: silentLogger(),
  });
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: () => null,
    rateLimitMax: false,
  });
  registerAllowedHostsRoutes(app, { instanceConfig, envBaseUrl: ENV_BASE_URL });
  return { app, instanceConfig };
};

describe('GET /allowed-hosts', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne le seul host env sur instance vierge', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/allowed-hosts' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ hosts: ['localhost:3000'] });
    } finally {
      await app.close();
    }
  });

  it('200 inclut envBaseUrl + base_url + additional_urls (dédupliqués)', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(1, {
        baseUrl: 'https://varde.example.com',
        additionalUrls: [
          { id: 'a', url: 'http://192.168.1.10:3000' },
          { id: 'b', url: 'https://varde.example.com' }, // dup avec base_url
        ],
      });
      const res = await app.inject({ method: 'GET', url: '/allowed-hosts' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { hosts: string[] };
      expect(body.hosts).toEqual(['localhost:3000', 'varde.example.com', '192.168.1.10:3000']);
    } finally {
      await app.close();
    }
  });

  it('200 toujours pas d auth requise (route publique)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/allowed-hosts' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('cache-control révéillable s-maxage=30', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/allowed-hosts' });
      expect(res.headers['cache-control']).toContain('s-maxage=30');
    } finally {
      await app.close();
    }
  });

  it('ignore les URLs corrompues sans planter', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(1, {
        additionalUrls: [
          { id: 'a', url: 'http://valid.example.com' },
          { id: 'b', url: 'not a url at all' },
        ],
      });
      const res = await app.inject({ method: 'GET', url: '/allowed-hosts' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { hosts: string[] };
      expect(body.hosts).toContain('valid.example.com');
      expect(body.hosts).not.toContain('not a url at all');
    } finally {
      await app.close();
    }
  });
});
