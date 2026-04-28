import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  registerSetupRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const noAuthAuthenticator: Authenticator = (): SessionData | null => null;

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

interface BuildOptions {
  readonly baseUrl?: string;
}

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
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
    authenticator: noAuthAuthenticator,
    rateLimitMax: false,
  });
  registerSetupRoutes(app, {
    instanceConfig,
    baseUrl: buildOptions.baseUrl ?? 'http://localhost:3000',
  });
  return { app, instanceConfig };
};

describe('GET /setup/status', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 sur DB vide : configured=false, currentStep=1', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ configured: false, currentStep: 1 });
    } finally {
      await app.close();
    }
  });

  it('200 reflète setStep en cours', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(4, { discordAppId: '111111111111111111' });
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ configured: false, currentStep: 4 });
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(7, { discordBotToken: 'tok' });
      await instanceConfig.complete();
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'setup_completed' });
    } finally {
      await app.close();
    }
  });
});

describe('GET /setup/redirect-uri', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne l URI dérivée du baseUrl par défaut', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        uri: 'http://localhost:3000/api/auth/callback/discord',
      });
    } finally {
      await app.close();
    }
  });

  it('200 honore un baseUrl custom', async () => {
    const { app } = await build(client, { baseUrl: 'https://varde.exemple.com' });
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        uri: 'https://varde.exemple.com/api/auth/callback/discord',
      });
    } finally {
      await app.close();
    }
  });

  it('200 normalise un trailing slash sur le baseUrl', async () => {
    const { app } = await build(client, { baseUrl: 'https://varde.exemple.com/' });
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        uri: 'https://varde.exemple.com/api/auth/callback/discord',
      });
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(7, { discordBotToken: 'tok' });
      await instanceConfig.complete();
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'setup_completed' });
    } finally {
      await app.close();
    }
  });
});

describe('routes /setup/* — auth publique', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('GET /setup/status : aucune session requise (pas de 401)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
