import type { Logger } from '@varde/contracts';
import type { OwnershipService } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

/**
 * Routes ownership de l'admin instance (jalon 7 PR 7.2).
 *
 * Ce module pose en l'état seulement le endpoint « claim-first »,
 * appelé par le hook Auth.js v5 du dashboard à chaque login Discord
 * pour absorber le cas démarrage frais où le premier user devient
 * owner. Les routes de gestion des owners (GET / POST / DELETE)
 * gardées par `requireOwner` arriveront aux sous-livrables 3-4 du
 * plan PR2-admin instance.md.
 *
 * **Sécurité du claim-first** : l'endpoint est public (pas de
 * cookie de session). C'est nécessaire — au moment du tout premier
 * login, aucun cookie n'est encore posé. Le risque de race entre
 * un attaquant et l'owner légitime existe mais reste théorique
 * dans le modèle déploiement « auto-hébergé, single instance,
 * single user au boot » de Varde. La méthode du service est
 * idempotente (pas d'effet après le premier claim) et l'API logge
 * en niveau `warn` chaque claim réussi pour traçabilité.
 */

/** Body wire de `POST /admin/ownership/claim-first`. */
const claimFirstBodySchema = z.object({
  /** Snowflake Discord du user qui vient de se loguer. */
  discordUserId: z
    .string()
    .regex(/^\d{17,20}$/, 'discordUserId doit être un snowflake Discord (17-20 chiffres)'),
  /**
   * Username Discord, optionnel — sert uniquement au log de
   * traçabilité côté serveur. L'API ne le persiste pas.
   */
  username: z.string().min(1).max(100).optional(),
});

/** Réponse de `POST /admin/ownership/claim-first`. */
export interface ClaimFirstOwnershipResponse {
  /**
   * `true` si le user vient d'être ajouté comme owner. `false` si
   * la table `instance_owners` contenait déjà au moins un owner —
   * dans ce cas, le user n'est PAS ajouté (les owners suivants
   * passent par les routes admin protégées).
   */
  readonly claimed: boolean;
}

/** Options de construction. */
export interface RegisterAdminOwnershipRoutesOptions {
  readonly ownership: OwnershipService;
  readonly logger: Logger;
}

const httpError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Error & { statusCode: number; code: string; details?: unknown } => {
  const err = new Error(message) as Error & {
    statusCode: number;
    code: string;
    details?: unknown;
  };
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
};

/**
 * Enregistre les routes `/admin/ownership/*` qui n'ont pas besoin
 * d'un owner (juste `claim-first` pour l'instant). Le reste des
 * routes admin (gardées par `requireOwner`) sera enregistré par
 * un module séparé aux sous-livrables ulterieurs.
 */
export function registerAdminOwnershipRoutes(
  app: FastifyInstance,
  options: RegisterAdminOwnershipRoutesOptions,
): void {
  const { ownership, logger } = options;
  const log = logger.child({ component: 'admin-ownership' });

  // Plafond serré, comme les routes setup : public + idempotent ne
  // veut pas dire qu'on laisse marteler.
  const rateLimit = { max: 10, timeWindow: '1 minute' } as const;

  // public-route: claim-first du wizard Auth.js — par construction sans session, idempotent post-claim, rate-limit 10 req/min/IP. Voir bloc-doc en tête du module.
  app.post(
    '/admin/ownership/claim-first',
    { config: { rateLimit } },
    async (request): Promise<ClaimFirstOwnershipResponse> => {
      const parsed = claimFirstBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const { discordUserId, username } = parsed.data;

      const result = await ownership.claimFirstOwnership(discordUserId);
      if (result.claimed) {
        log.warn('Ownership claimed', {
          discordUserId,
          ...(username !== undefined ? { username } : {}),
        });
      }
      return { claimed: result.claimed };
    },
  );
}
