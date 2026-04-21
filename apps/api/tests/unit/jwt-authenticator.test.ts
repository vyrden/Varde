import type { FastifyRequest } from 'fastify';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { createJwtAuthenticator } from '../../src/jwt-authenticator.js';

const SECRET = 'super-secret-for-tests';
const key = new TextEncoder().encode(SECRET);

const sign = async (
  claims: Record<string, unknown>,
  options: { exp?: number; aud?: string; iss?: string } = {},
): Promise<string> => {
  let builder = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (options.exp !== undefined) builder = builder.setExpirationTime(options.exp);
  if (options.aud !== undefined) builder = builder.setAudience(options.aud);
  if (options.iss !== undefined) builder = builder.setIssuer(options.iss);
  return builder.sign(key);
};

const request = (cookies?: Record<string, string>): FastifyRequest =>
  ({ cookies: cookies ?? {} }) as unknown as FastifyRequest;

describe('createJwtAuthenticator', () => {
  it('retourne la session quand le cookie contient un JWT valide', async () => {
    const token = await sign({ sub: '42', username: 'alice', accessToken: 'xyz' });
    const auth = createJwtAuthenticator({ secret: SECRET });
    const session = await auth(request({ 'varde.session': token }));
    expect(session).toEqual({ userId: '42', username: 'alice', accessToken: 'xyz' });
  });

  it('retourne null si le cookie est absent', async () => {
    const auth = createJwtAuthenticator({ secret: SECRET });
    expect(await auth(request())).toBeNull();
  });

  it('retourne null si le JWT est mal formé', async () => {
    const auth = createJwtAuthenticator({ secret: SECRET });
    expect(await auth(request({ 'varde.session': 'not-a-jwt' }))).toBeNull();
  });

  it('retourne null si la signature est fausse (mauvais secret)', async () => {
    const token = await sign({ sub: '42' });
    const auth = createJwtAuthenticator({ secret: 'different-secret' });
    expect(await auth(request({ 'varde.session': token }))).toBeNull();
  });

  it('retourne null si le JWT est expiré', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const token = await sign({ sub: '42' }, { exp: past });
    const auth = createJwtAuthenticator({ secret: SECRET });
    expect(await auth(request({ 'varde.session': token }))).toBeNull();
  });

  it('retourne null si sub manque dans les claims', async () => {
    const token = await sign({ username: 'alice' });
    const auth = createJwtAuthenticator({ secret: SECRET });
    expect(await auth(request({ 'varde.session': token }))).toBeNull();
  });

  it('respecte cookieName personnalisé', async () => {
    const token = await sign({ sub: '42' });
    const auth = createJwtAuthenticator({ secret: SECRET, cookieName: 'authjs.session-token' });
    expect(await auth(request({ 'varde.session': token }))).toBeNull();
    expect(await auth(request({ 'authjs.session-token': token }))).toEqual({ userId: '42' });
  });

  it("valide l'audience quand elle est déclarée", async () => {
    const token = await sign({ sub: '42' }, { aud: 'varde-dashboard' });
    const auth = createJwtAuthenticator({ secret: SECRET, audience: 'varde-dashboard' });
    expect(await auth(request({ 'varde.session': token }))).toEqual({ userId: '42' });

    const authWrong = createJwtAuthenticator({ secret: SECRET, audience: 'autre' });
    expect(await authWrong(request({ 'varde.session': token }))).toBeNull();
  });
});
