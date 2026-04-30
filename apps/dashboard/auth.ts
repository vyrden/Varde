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

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';

type JsonObject = Record<string, unknown>;

/**
 * Hook ownership : à chaque login Discord réussi, on appelle
 * `POST /admin/ownership/claim-first` côté API. L'endpoint est
 * idempotent côté serveur (no-op si la table contient déjà au
 * moins un owner), donc on peut le déclencher sans condition.
 *
 * Échec silencieux : un problème réseau ne doit pas bloquer le
 * login. La réussite ou l'échec est logué côté API ; côté
 * dashboard on reste muet pour ne pas spammer la console
 * utilisateur sur des chemins legacy.
 */
async function tryClaimFirstOwnership(
  discordUserId: string,
  username: string | undefined,
): Promise<void> {
  try {
    await fetch(`${API_URL}/admin/ownership/claim-first`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        discordUserId,
        ...(username !== undefined ? { username } : {}),
      }),
      cache: 'no-store',
    });
  } catch {
    // L'API peut être hors-ligne (dev sans `apps/server`). Le
    // claim sera retenté au prochain login.
  }
}

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
  // Auth.js v5 log par défaut un `JWTSessionError` quand un cookie
  // de session ne peut pas être décodé (rotation de
  // `VARDE_AUTH_SECRET`, cookie corrompu, format de JWT obsolète,
  // etc.). Côté code, notre `jwt.decode` rattrape l'exception et
  // renvoie `null` → l'utilisateur retombe sur l'écran de connexion,
  // ce qui est le comportement voulu. Mais le `console.error`
  // interne d'Auth.js pop dans l'overlay Next.js et fait croire à un
  // bug. On filtre uniquement ce code-là pour conserver la visibilité
  // sur les autres erreurs Auth (config provider, callback, etc.).
  logger: {
    error(error) {
      if (error.name === 'JWTSessionError') return;
      // biome-ignore lint/suspicious/noConsole: Auth.js attend un sink synchrone, console est le sink standard côté Next.js (pas de Pino injectable ici sans recâblage massif).
      console.error(`[auth][error] ${error.name}: ${error.message}`);
    },
    warn(code) {
      // biome-ignore lint/suspicious/noConsole: idem error — sink Auth.js, pas un log applicatif.
      console.warn(`[auth][warn] ${code}`);
    },
    debug(code, metadata) {
      if (process.env['VARDE_AUTH_DEBUG'] === '1') {
        // biome-ignore lint/suspicious/noConsole: gated derrière VARDE_AUTH_DEBUG=1, opt-in dev only.
        console.debug(`[auth][debug] ${code}`, metadata);
      }
    },
  },
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
    async signIn({ profile }) {
      // Tenter le claim-first à chaque login. Idempotent côté API
      // — pas de coût après le premier owner acquis. Cette logique
      // vit ici (côté dashboard) plutôt que côté API parce que
      // c'est Auth.js qui détient l'ID Discord vérifié juste après
      // l'échange OAuth.
      if (profile && typeof profile === 'object') {
        const discordProfile = profile as { id?: unknown; username?: unknown };
        if (typeof discordProfile.id === 'string' && discordProfile.id.length > 0) {
          await tryClaimFirstOwnership(
            discordProfile.id,
            typeof discordProfile.username === 'string' ? discordProfile.username : undefined,
          );
        }
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token['accessToken'] = account.access_token;
      }
      if (profile && typeof profile === 'object') {
        const discordProfile = profile as {
          id?: string;
          username?: string;
          global_name?: string | null;
          avatar?: string | null;
          avatar_decoration_data?: { asset?: string; sku_id?: string } | null;
        };
        if (discordProfile.id) token.sub = discordProfile.id;
        if (discordProfile.username) token['username'] = discordProfile.username;
        if (typeof discordProfile.global_name === 'string') {
          token['globalName'] = discordProfile.global_name;
        }
        // Hash avatar Discord (string vide ou null = pas d'avatar
        // custom, on retombe sur le default Discord).
        if (typeof discordProfile.avatar === 'string' && discordProfile.avatar.length > 0) {
          token['avatarHash'] = discordProfile.avatar;
        }
        // Asset de la décoration d'avatar (Nitro). Présent
        // uniquement si l'utilisateur en a une.
        const decoAsset = discordProfile.avatar_decoration_data?.asset;
        if (typeof decoAsset === 'string' && decoAsset.length > 0) {
          token['avatarDecorationAsset'] = decoAsset;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.sub === 'string' && token.sub.length > 0) {
        const username = token['username'];
        const globalName = token['globalName'];
        const avatarHash = token['avatarHash'];
        const decoAsset = token['avatarDecorationAsset'];

        // URL avatar : `/avatars/{userId}/{hash}.png`. Animé si
        // hash commence par `a_` → on sert le `.gif` directement,
        // Discord renvoie un fallback statique si Nitro absent.
        const avatarUrl =
          typeof avatarHash === 'string'
            ? `https://cdn.discordapp.com/avatars/${token.sub}/${avatarHash}${
                avatarHash.startsWith('a_') ? '.gif' : '.png'
              }?size=64`
            : null;
        // URL de la décoration : PNG transparent overlay 96x96.
        const decorationUrl =
          typeof decoAsset === 'string'
            ? `https://cdn.discordapp.com/avatar-decoration-presets/${decoAsset}.png?size=96&passthrough=true`
            : null;

        session.user = {
          ...session.user,
          id: token.sub,
          ...(typeof username === 'string' ? { name: username } : {}),
          ...(typeof globalName === 'string' ? { globalName } : {}),
          ...(avatarUrl !== null ? { image: avatarUrl } : {}),
          ...(decorationUrl !== null ? { avatarDecorationUrl: decorationUrl } : {}),
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
      /** `global_name` Discord — le pseudo affiché public, fallback `name`. */
      globalName?: string | null;
      image?: string | null;
      /** PNG transparent du décor d'avatar Nitro. Null si l'utilisateur n'en a pas. */
      avatarDecorationUrl?: string | null;
      email?: string | null;
    };
  }
}
