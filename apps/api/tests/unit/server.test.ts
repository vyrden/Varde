import { createLogger } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Authenticator, createApiServer, type SessionData } from '../../src/server.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

/**
 * Authenticator de test : lit `x-test-session` comme JSON. Permet de
 * simuler une session sans Auth.js ni @fastify/session.
 */
const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

describe('createApiServer — /health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApiServer({
      logger: silentLogger(),
      version: '0.0.0-test',
      authenticator: headerAuthenticator,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('répond 200 avec status ok et version', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      version: '0.0.0-test',
    });
  });

  it('expose uptime numérique', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(typeof response.json().uptime).toBe('number');
  });

  it('exposeHealth=false retire la route', async () => {
    await app.close();
    app = await createApiServer({
      logger: silentLogger(),
      version: 'x',
      authenticator: headerAuthenticator,
      exposeHealth: false,
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(404);
  });
});

describe('createApiServer — /me', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApiServer({
      logger: silentLogger(),
      version: '0.0.0-test',
      authenticator: headerAuthenticator,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('renvoie 401 quand aucune session n est présente', async () => {
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthenticated' });
  });

  it('renvoie la session quand le header x-test-session est posé', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        'x-test-session': JSON.stringify({ userId: '42', username: 'alice' }),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: '42', username: 'alice' });
  });

  it('renvoie 401 si la session est présente mais malformée (JSON invalide)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-session': '{not-json' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('createApiServer — security headers', () => {
  it('pose les headers de sécurité par défaut (helmet)', async () => {
    const app = await createApiServer({
      logger: silentLogger(),
      version: 'x',
      authenticator: headerAuthenticator,
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      // Helmet pose ces headers d'office sur toutes les réponses.
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['x-download-options']).toBe('noopen');
      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
      // CSP par défaut helmet : `default-src 'self'` + sous-directives
      // restrictives. On vérifie sa présence sans figer la valeur
      // exacte (helmet l'enrichit selon les versions).
      expect(typeof response.headers['content-security-policy']).toBe('string');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    } finally {
      await app.close();
    }
  });

  it('cache la version Fastify (x-powered-by absent)', async () => {
    const app = await createApiServer({
      logger: silentLogger(),
      version: 'x',
      authenticator: headerAuthenticator,
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.headers['x-powered-by']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

describe('createApiServer — CORS', () => {
  it('expose les headers CORS quand corsOrigin est défini', async () => {
    const app = await createApiServer({
      logger: silentLogger(),
      version: 'x',
      authenticator: headerAuthenticator,
      corsOrigin: 'http://localhost:3000',
    });
    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      await app.close();
    }
  });

  it("n'active pas CORS par défaut", async () => {
    const app = await createApiServer({
      logger: silentLogger(),
      version: 'x',
      authenticator: headerAuthenticator,
    });
    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
