import { describe, expect, it } from 'vitest';

import { decideLoginPlan, resolveBaseUrl } from '../../src/boot.js';

describe('resolveBaseUrl', () => {
  it('retourne la valeur env si renseignée', () => {
    expect(resolveBaseUrl('https://varde.exemple.com')).toBe('https://varde.exemple.com');
  });

  it('retourne le défaut http://localhost:3000 quand vide', () => {
    expect(resolveBaseUrl(undefined)).toBe('http://localhost:3000');
    expect(resolveBaseUrl('')).toBe('http://localhost:3000');
  });

  it('trim les espaces', () => {
    expect(resolveBaseUrl('  https://x.test  ')).toBe('https://x.test');
  });
});

describe('decideLoginPlan', () => {
  const baseUrl = 'http://localhost:3000';

  it('configured + token DB → kind="db" avec ce token', () => {
    expect(
      decideLoginPlan({
        configured: true,
        dbToken: 'tok-from-db',
        envToken: null,
        baseUrl,
      }),
    ).toEqual({ kind: 'db', token: 'tok-from-db' });
  });

  it('configured + token DB ignore le token env', () => {
    expect(
      decideLoginPlan({
        configured: true,
        dbToken: 'tok-from-db',
        envToken: 'tok-env-legacy',
        baseUrl,
      }),
    ).toEqual({ kind: 'db', token: 'tok-from-db' });
  });

  it('configured sans token DB → kind="wait" (état incohérent, ne pas tenter le login)', () => {
    expect(
      decideLoginPlan({
        configured: true,
        dbToken: null,
        envToken: null,
        baseUrl,
      }).kind,
    ).toBe('wait');
  });

  it('non configured + token env → kind="env" avec le token env (chemin legacy)', () => {
    expect(
      decideLoginPlan({
        configured: false,
        dbToken: null,
        envToken: 'tok-env',
        baseUrl,
      }),
    ).toEqual({ kind: 'env', token: 'tok-env' });
  });

  it('non configured + ni DB ni env → kind="wait" avec un message qui pointe vers /setup', () => {
    const plan = decideLoginPlan({
      configured: false,
      dbToken: null,
      envToken: null,
      baseUrl: 'http://localhost:3000',
    });
    expect(plan.kind).toBe('wait');
    if (plan.kind === 'wait') {
      expect(plan.message).toContain('http://localhost:3000/setup');
    }
  });
});
