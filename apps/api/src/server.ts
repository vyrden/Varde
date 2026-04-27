import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Logger } from '@varde/contracts';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

/**
 * Surface d'une session côté API. `accessToken` est l'access_token
 * OAuth2 Discord obtenu par le dashboard Auth.js au login et propagé
 * dans le JWT de session ; l'API s'en sert pour appeler l'API
 * Discord au nom du user (ex. `/users/@me/guilds`).
 */
export interface SessionData {
  readonly userId: string;
  readonly username?: string;
  readonly accessToken?: string;
}

/**
 * Stratégie d'authentification injectée au serveur. Reçoit la requête
 * Fastify brute, retourne la session si l'appelant est identifié,
 * `null` sinon. La production lira un cookie signé par Auth.js
 * (PR 2.4) ; les tests injectent une implémentation qui consulte un
 * header `x-test-session`.
 *
 * Le serveur est volontairement agnostique du mécanisme d'auth :
 * il ne dépend pas de `@fastify/session`, pour permettre à PR 2.4
 * de brancher Auth.js sans refonte.
 */
export type Authenticator = (
  request: FastifyRequest,
) => SessionData | null | Promise<SessionData | null>;

/** Options de construction du serveur. */
export interface CreateApiServerOptions {
  readonly logger: Logger;
  /** Version applicative renvoyée par `/health`. */
  readonly version: string;
  readonly authenticator: Authenticator;
  /** Origin autorisée pour CORS. Défaut : `false` (pas de CORS). */
  readonly corsOrigin?: string | false;
  /** Exposer `/health` publiquement (défaut : `true`). */
  readonly exposeHealth?: boolean;
  /**
   * Plafond global de requêtes par IP par minute. Défaut : `300`
   * (5/s en moyenne, large). Mettre `false` pour désactiver le
   * rate limiting (utile pour les benchmarks de tests).
   */
  readonly rateLimitMax?: number | false;
  /** Fenêtre de comptage. Défaut : `'1 minute'`. */
  readonly rateLimitTimeWindow?: string;
}

/**
 * Construit une instance Fastify prête à listen. Les routes métier
 * (modules, config, audit, guilds) sont ajoutées par d'autres
 * fonctions aux PR 2.4–2.6.
 */
export async function createApiServer(options: CreateApiServerOptions): Promise<FastifyInstance> {
  const {
    authenticator,
    corsOrigin = false,
    exposeHealth = true,
    logger,
    version,
    rateLimitMax = 300,
    rateLimitTimeWindow = '1 minute',
  } = options;

  // Fastify a son propre logger Pino interne ; on se contente d'un
  // relai via le logger injecté pour les quelques messages posés
  // par nos routes (pas d'access log par défaut).
  const apiLogger = logger.child({ component: 'api' });

  const app: FastifyInstance = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  // @fastify/cookie est requis par les authenticators qui lisent
  // un cookie de session (la variante JWT de production). On l'enregistre
  // systématiquement : coût négligeable, API cohérente pour tous les
  // modes de déploiement.
  await app.register(cookie);

  // Headers de sécurité (jalon 5). L'API ne sert que du JSON donc la
  // CSP par défaut de helmet est sans effet pratique côté navigateur,
  // mais la pose des headers reste utile au cas où une réponse HTML
  // d'erreur passerait, et signale aux scanners de sécurité que la
  // surface est durcie. HSTS s'active uniquement quand le client est
  // en HTTPS — en dev (HTTP) Fastify ne l'envoie pas.
  await app.register(helmet, {
    // L'API n'embarque pas de page HTML : on laisse les défauts
    // helmet (CSP `default-src 'self'`, X-Frame-Options DENY, etc.).
    // L'option `crossOriginResourcePolicy: 'same-site'` autoriserait
    // un futur dashboard sous-domaine à fetch ; aujourd'hui on est en
    // single-origin via reverse-proxy donc le défaut `same-origin`
    // est plus strict et conforme.
  });

  if (corsOrigin !== false) {
    await app.register(cors, { origin: corsOrigin, credentials: true });
  }

  // Rate limiting global (jalon 5). Posé avant les routes pour que
  // le pre-handler check tous les endpoints, même `/health`. Les
  // routes coûteuses (LLM via `/onboarding/ai/*`) imposent un
  // plafond plus strict via `config.rateLimit` au niveau route.
  // `skipOnError: true` (défaut) : si le store interne plante, on
  // laisse passer plutôt que de DoS soi-même.
  if (rateLimitMax !== false) {
    await app.register(rateLimit, {
      max: rateLimitMax,
      timeWindow: rateLimitTimeWindow,
      // Identifie l'appelant par IP. En prod derrière un reverse-
      // proxy (Caddy/Traefik), Fastify lit `X-Forwarded-For` si la
      // chaîne `trustProxy` est posée — pas nécessaire en V1
      // tant qu'on est en single-host. Doc à compléter au jalon 6.
      keyGenerator: (request) => request.ip,
    });
  }

  const ensureSession = async (request: FastifyRequest): Promise<SessionData> => {
    const existing = (request as FastifyRequest & { vardeSession?: SessionData | null })
      .vardeSession;
    if (existing) {
      return existing;
    }
    const session = await authenticator(request);
    if (!session) {
      const error: Error & { statusCode?: number } = new Error('unauthenticated');
      error.statusCode = 401;
      throw error;
    }
    (request as FastifyRequest & { vardeSession: SessionData }).vardeSession = session;
    return session;
  };

  app.decorate('ensureSession', ensureSession);

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & {
      statusCode?: number;
      httpStatus?: number;
      code?: string;
      details?: unknown;
    };
    // Les AppError de @varde/contracts portent `httpStatus`. Fastify
    // et les HTTP errors classiques posent `statusCode`. On regarde
    // les deux, en privilégiant la forme Fastify.
    const statusCode = err.statusCode ?? err.httpStatus ?? 500;
    if (statusCode === 401) {
      void reply.status(401).send({ error: 'unauthenticated' });
      return;
    }
    apiLogger.warn('api error', {
      method: request.method,
      url: request.url,
      error: err.message,
      statusCode,
    });
    const body: { error: string; message: string; details?: unknown } = {
      error: err.code ?? err.name ?? 'internal_error',
      message: err.message,
    };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    void reply.status(statusCode).send(body);
  });

  if (exposeHealth) {
    app.get('/health', async () => ({
      status: 'ok' as const,
      version,
      uptime: process.uptime(),
    }));
  }

  app.get('/me', async (request) => ensureSession(request));

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    readonly ensureSession: (request: FastifyRequest) => Promise<SessionData>;
  }
}
