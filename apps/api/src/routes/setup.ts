import type { InstanceConfigService } from '@varde/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Routes du wizard de setup initial (jalon 7 PR 7.1). Toutes sous
 * `/setup/*`. Trois caractéristiques structurantes :
 *
 * 1. **Auth publique.** Aucune session n'est requise — par
 *    construction le wizard tourne avant qu'aucun utilisateur ne soit
 *    connecté. Personne ne peut atteindre le dashboard tant que la
 *    setup n'est pas terminée (le middleware Next.js redirige tout
 *    `/*` vers `/setup/*`).
 *
 * 2. **Fermeture après complétion.** Toutes les routes sont protégées
 *    par un preHandler qui retourne 403 dès que `setup_completed_at`
 *    est posé. Le 403 sert de signal au middleware Next.js « cette
 *    instance n'a plus rien à faire dans `/setup` ». Plus aucun
 *    moyen de rejouer la setup en l'état (la PR 2 du chantier 2
 *    introduira une page admin qui permettra de modifier les valeurs
 *    a posteriori, en passant par une autre surface d'API).
 *
 * 3. **Rate limit serré.** Comme les routes sont publiques, on
 *    plafonne 10 req/min/IP via le `@fastify/rate-limit` global. Un
 *    client buggé ou malveillant ne peut pas marteler les vérifs
 *    Discord ni tester des tokens à la chaîne.
 *
 * Cette PR pose la fondation : les deux routes en lecture
 * (`status`, `redirect-uri`) plus le preHandler. Les routes d'écriture
 * (`system-check`, `discord-app`, `bot-token`, `oauth`, `identity`,
 * `complete`) seront ajoutées dans des PR suivantes pour rester
 * reviewables.
 */

/** Options de construction. */
export interface RegisterSetupRoutesOptions {
  readonly instanceConfig: InstanceConfigService;
  /**
   * URL d'accès au dashboard (typiquement `http://localhost:3000` en
   * local, `https://votre-domaine.com` en prod). Sert à dériver
   * l'URI de redirection OAuth2 affichée à l'étape « OAuth » du
   * wizard.
   */
  readonly baseUrl: string;
}

/**
 * Construit l'URI de callback OAuth2 attendue par Discord à partir
 * du `baseUrl`. Strip un éventuel slash final pour ne pas produire
 * `https://x.com//api/...`.
 */
const buildRedirectUri = (baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/+$/u, '');
  return `${normalized}/api/auth/callback/discord`;
};

/**
 * Enregistre les routes `/setup/*` sur l'instance Fastify fournie.
 */
export function registerSetupRoutes(
  app: FastifyInstance,
  options: RegisterSetupRoutesOptions,
): void {
  const { instanceConfig, baseUrl } = options;

  // Plafond serré : ces routes sont publiques pendant le wizard, on
  // les protège contre l'abus avec 10 req/min/IP. Le rate-limiter
  // global est déjà à 300/min/IP — `config.rateLimit` ne vient pas
  // s'ajouter mais le remplacer pour cette route.
  const setupRateLimit = { max: 10, timeWindow: '1 minute' } as const;

  /**
   * Refuse l'accès à toutes les routes `/setup/*` une fois que la
   * setup est terminée. 403 plutôt que 404 : le client (Next.js
   * middleware notamment) doit pouvoir distinguer « pas configurée
   * encore » de « déjà configurée ».
   */
  const requireUnconfigured = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const status = await instanceConfig.getStatus();
    if (status.configured) {
      void reply.status(403).send({
        error: 'setup_completed',
        message: 'La setup de cette instance est déjà terminée.',
      });
    }
  };

  app.get(
    '/setup/status',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async () => {
      const status = await instanceConfig.getStatus();
      return status;
    },
  );

  app.get(
    '/setup/redirect-uri',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async () => {
      return { uri: buildRedirectUri(baseUrl) };
    },
  );
}
