import { jwtVerify } from 'jose';

import type { Authenticator, SessionData } from './server.js';

/**
 * Authenticator production : lit un cookie JWT (HS256 signé avec un
 * secret partagé entre dashboard Auth.js et API), vérifie la
 * signature, extrait `sub` (user id Discord), `username` et
 * `accessToken` (Discord OAuth). Retourne `null` sans lever sur toute
 * erreur de décodage — le serveur transforme `null` en 401.
 *
 * Le cookie est posé par Auth.js côté dashboard avec la même clé
 * symétrique (env `VARDE_AUTH_SECRET`). Auth.js v5 permet d'override
 * `jwt.encode`/`jwt.decode` pour utiliser HS256 au lieu du JWE par
 * défaut, ce qui permet à l'API d'utiliser `jose` sans inclure
 * `next-auth` comme dépendance.
 */

export interface CreateJwtAuthenticatorOptions {
  /** Secret HS256 partagé avec le dashboard. */
  readonly secret: string;
  /** Nom du cookie. Défaut : `varde.session`. */
  readonly cookieName?: string;
  /** Audience attendue dans le JWT (optionnel). */
  readonly audience?: string;
  /** Issuer attendu dans le JWT (optionnel). */
  readonly issuer?: string;
}

interface JwtClaims {
  readonly sub?: string;
  readonly username?: string;
  readonly accessToken?: string;
}

/**
 * Produit un `Authenticator` pour `createApiServer`. Nécessite que
 * `@fastify/cookie` soit enregistré sur l'instance Fastify avant que
 * l'authenticator soit invoqué (sinon `request.cookies` est `undefined`
 * et l'authenticator retourne `null`).
 */
export function createJwtAuthenticator(options: CreateJwtAuthenticatorOptions): Authenticator {
  const cookieName = options.cookieName ?? 'varde.session';
  const key = new TextEncoder().encode(options.secret);

  return async (request) => {
    const cookies = (request as unknown as { cookies?: Record<string, string | undefined> })
      .cookies;
    const token = cookies?.[cookieName];
    if (typeof token !== 'string' || token.length === 0) {
      return null;
    }
    try {
      const verifyOptions: { audience?: string; issuer?: string; algorithms: string[] } = {
        algorithms: ['HS256'],
      };
      if (options.audience !== undefined) verifyOptions.audience = options.audience;
      if (options.issuer !== undefined) verifyOptions.issuer = options.issuer;

      const { payload } = await jwtVerify(token, key, verifyOptions);
      const claims = payload as JwtClaims;
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        return null;
      }
      const session: SessionData = {
        userId: claims.sub,
        ...(typeof claims.username === 'string' ? { username: claims.username } : {}),
        ...(typeof claims.accessToken === 'string' ? { accessToken: claims.accessToken } : {}),
      };
      return session;
    } catch {
      return null;
    }
  };
}
