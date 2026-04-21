import cors from '@fastify/cors';
import type { Logger } from '@varde/contracts';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

/**
 * Surface minimale d'une session côté API. Étendue quand l'auth
 * Discord arrive en PR 2.4 (scopes, access_token, avatarUrl…).
 */
export interface SessionData {
  readonly userId: string;
  readonly username?: string;
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
}

/**
 * Construit une instance Fastify prête à listen. Les routes métier
 * (modules, config, audit, guilds) sont ajoutées par d'autres
 * fonctions aux PR 2.4–2.6.
 */
export async function createApiServer(options: CreateApiServerOptions): Promise<FastifyInstance> {
  const { authenticator, corsOrigin = false, exposeHealth = true, logger, version } = options;

  // Fastify a son propre logger Pino interne ; on se contente d'un
  // relai via le logger injecté pour les quelques messages posés
  // par nos routes (pas d'access log par défaut).
  const apiLogger = logger.child({ component: 'api' });

  const app: FastifyInstance = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  if (corsOrigin !== false) {
    await app.register(cors, { origin: corsOrigin, credentials: true });
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
    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;
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
    void reply.status(statusCode).send({
      error: err.name || 'internal_error',
      message: err.message,
    });
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
