import { timingSafeEqual } from 'node:crypto';

import type { Logger } from '@varde/contracts';
import type { InstanceConfigService } from '@varde/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Endpoint interne `GET /internal/oauth-credentials` (jalon 7 PR 7.5).
 *
 * Retourne en clair `{ clientId, clientSecret }` à un appelant
 * authentifié par un `Authorization: Bearer <VARDE_AUTH_SECRET>`.
 * C'est la pièce qui permet au dashboard d'arrêter de lire les
 * credentials Discord depuis `process.env` et de les obtenir depuis
 * la BDD chiffrée — la source de vérité posée à PR 7.1 / 7.2.
 *
 * **Pourquoi un endpoint dédié plutôt qu'un partage DB direct.** Le
 * dashboard est volontairement isolé de la base : il ne tape pas
 * Postgres, il ne connaît pas la master key (`VARDE_MASTER_KEY` vit
 * uniquement côté `apps/server`). Tout passe par l'API. Cet
 * endpoint est l'unique surface qui expose ces secrets en clair —
 * il vit donc sous `/internal/*` pour signaler son statut, et la
 * doc déploiement recommande de bloquer ce préfixe au reverse-proxy
 * (Caddy / Traefik). Un appelant sans accès à `VARDE_AUTH_SECRET`
 * (le shared secret API↔dashboard, déjà utilisé pour signer/lire
 * les JWT de session) ne peut rien.
 *
 * **Bearer plutôt que cookie.** Le dashboard appelle ici depuis ses
 * Server Components / route handlers, pas depuis le navigateur. Pas
 * de session utilisateur en jeu, juste une preuve « je suis le
 * dashboard ». Bearer rend ça explicite et évite de mélanger les
 * sémantiques (cookie = session humaine, Bearer = service-to-
 * service).
 *
 * **Comparaison timing-safe.** `crypto.timingSafeEqual` exige des
 * Buffers de longueur égale. On vérifie la longueur AVANT le
 * `timingSafeEqual` pour ne pas crash sur un Bearer plus court ou
 * plus long ; ce fast-path leak un bit (« même longueur ou pas »),
 * mais le secret partagé a 32+ caractères aléatoires, donc le bit
 * de longueur est inutile pour deviner la valeur.
 *
 * **Statuts** : 401 sans Bearer ou Bearer invalide ; 404 quand
 * `discordAppId` ou `discordClientSecret` ne sont pas (encore)
 * posés en DB — l'instance est en cours de setup, pas un état
 * d'erreur. Le client traite ça comme « pas prêt, retry plus
 * tard ».
 */

export interface InternalOauthCredentialsResponse {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface RegisterInternalCredentialsRoutesOptions {
  readonly instanceConfig: InstanceConfigService;
  /**
   * Secret partagé avec le dashboard (`VARDE_AUTH_SECRET` côté
   * env). Déjà utilisé pour la signature HS256 des JWT de session,
   * réutilisé ici pour ne pas multiplier les secrets à gérer.
   */
  readonly internalAuthSecret: string;
  readonly logger: Logger;
}

const verifyBearer = (request: FastifyRequest, expected: string): boolean => {
  const header = request.headers['authorization'];
  if (typeof header !== 'string') return false;
  if (!header.startsWith('Bearer ')) return false;
  const provided = header.slice('Bearer '.length).trim();
  if (provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

export function registerInternalCredentialsRoutes(
  app: FastifyInstance,
  options: RegisterInternalCredentialsRoutesOptions,
): void {
  const { instanceConfig, internalAuthSecret, logger } = options;
  const log = logger.child({ component: 'internal-credentials' });

  app.get(
    '/internal/oauth-credentials',
    // Plafond strict : ce endpoint est appelé à froid par le dashboard
    // au démarrage (puis caché 60 s côté client), pas de raison qu'il
    // dépasse 60 req/min/IP en exploitation normale.
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply): Promise<InternalOauthCredentialsResponse | undefined> => {
      if (!verifyBearer(request, internalAuthSecret)) {
        log.warn('rejet /internal/oauth-credentials : Bearer invalide', { ip: request.ip });
        void reply.status(401).send({
          error: 'unauthenticated',
          message: 'Bearer token absent ou invalide',
        });
        return undefined;
      }
      const config = await instanceConfig.getConfig();
      if (config.discordAppId === null || config.discordClientSecret === null) {
        void reply.status(404).send({
          error: 'not_configured',
          message: 'Credentials OAuth Discord non configurés (wizard à compléter)',
        });
        return undefined;
      }
      return {
        clientId: config.discordAppId,
        clientSecret: config.discordClientSecret,
      };
    },
  );
}
