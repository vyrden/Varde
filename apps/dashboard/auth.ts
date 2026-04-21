import { jwtVerify, SignJWT } from 'jose';
import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';

/**
 * Configuration Auth.js v5 côté dashboard.
 *
 * Choix structurants (ADR 0006) :
 * - Session stratégie JWT (pas DB). Le token est signé HS256 avec
 *   `VARDE_AUTH_SECRET`, secret partagé avec l'API pour que celle-ci
 *   décode le même cookie via `jose`. Ce choix évite d'inclure
 *   `next-auth` côté API Fastify et rend l'échange purement standard.
 * - Cookie nommé `varde.session` pour simplifier le câblage avec
 *   l'API (même valeur que `cookieName` par défaut de
 *   `createJwtAuthenticator` dans `@varde/api`).
 * - Scopes Discord : `identify` (nécessaire au login) et `guilds`
 *   (nécessaire à l'API pour `/users/@me/guilds`).
 * - `accessToken` Discord propagé dans le JWT via le callback `jwt`,
 *   puis consommé par l'API au lieu d'être stocké en base (pas de
 *   persistance de token, pas de DB access côté dashboard en V1).
 *
 * Les `clientId` / `clientSecret` Discord viennent de
 * `VARDE_DISCORD_CLIENT_ID` / `VARDE_DISCORD_CLIENT_SECRET`. En
 * l'absence (ex. CI qui ne fait que `next build`), Auth.js accepte
 * les valeurs vides à l'init — le signIn échouera au runtime mais
 * la compilation passe.
 */

const secret = process.env['VARDE_AUTH_SECRET'] ?? 'dev-only-insecure-change-in-production-please';
const key = new TextEncoder().encode(secret);
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7; // 7 jours

type JsonObject = Record<string, unknown>;

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Discord({
      clientId: process.env['VARDE_DISCORD_CLIENT_ID'] ?? '',
      clientSecret: process.env['VARDE_DISCORD_CLIENT_SECRET'] ?? '',
      authorization: { params: { scope: 'identify guilds' } },
    }),
  ],
  secret,
  session: { strategy: 'jwt', maxAge: sessionMaxAgeSeconds },
  cookies: {
    sessionToken: {
      name: 'varde.session',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  jwt: {
    async encode({ token }) {
      if (!token) return '';
      return new SignJWT(token as JsonObject)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${sessionMaxAgeSeconds}s`)
        .setSubject(typeof token.sub === 'string' ? token.sub : '')
        .sign(key);
    },
    async decode({ token }) {
      if (typeof token !== 'string' || token.length === 0) return null;
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        return payload as JsonObject;
      } catch {
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token['accessToken'] = account.access_token;
      }
      if (profile && typeof profile === 'object') {
        const discordProfile = profile as { id?: string; username?: string };
        if (discordProfile.id) token.sub = discordProfile.id;
        if (discordProfile.username) token['username'] = discordProfile.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.sub === 'string' && token.sub.length > 0) {
        const username = token['username'];
        session.user = {
          ...session.user,
          id: token.sub,
          ...(typeof username === 'string' ? { name: username } : {}),
        };
      }
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      image?: string | null;
      email?: string | null;
    };
  }
}
