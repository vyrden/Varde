import type { InstanceConfigService } from '@varde/core';
import type { FastifyInstance } from 'fastify';

/**
 * Route publique `GET /allowed-hosts` (jalon 7 PR 7.2 sub-livrable 6).
 * Retourne la liste des hôtes autorisés à atteindre le dashboard.
 *
 * Calcul :
 * - host extrait de `instance_config.base_url` (s'il est posé),
 * - hosts extraits de `instance_config.additional_urls`,
 * - host extrait du `envBaseUrl` (la valeur d'environnement, en
 *   fallback même quand `base_url` est posé — on n'enferme jamais
 *   l'admin dehors de localhost ou du domaine de boot).
 *
 * Le port est conservé quand il est non-standard (`:3000`,
 * `:8080`…). Pas d'auth requise — la liste de hostnames n'est pas
 * un secret, et le middleware Next.js qui consomme cet endpoint
 * tourne avant toute session. Le rate-limit global (300 req/min/IP)
 * suffit comme garde anti-abus.
 *
 * Cette route alimente la « whitelist callback URL » côté Auth.js
 * (cf. `apps/dashboard/middleware.ts`) : tant que le `Host:` d'une
 * requête entrante n'est pas dans cette liste, le dashboard rejette
 * la tentative de login avec un 403 explicite — défense en
 * profondeur même quand Discord est configuré pour accepter
 * plusieurs redirect URIs.
 */

const REVALIDATE_HEADER = 's-maxage=30, stale-while-revalidate=30';

/** Réponse de `GET /allowed-hosts`. */
export interface AllowedHostsResponse {
  readonly hosts: readonly string[];
}

/** Options de construction. */
export interface RegisterAllowedHostsRoutesOptions {
  readonly instanceConfig: InstanceConfigService;
  /**
   * Valeur d'environnement de `baseUrl` (`BASE_URL` ou défaut
   * localhost). Toujours injectée dans la liste retournée — c'est
   * le filet de sécurité qui empêche un admin de se priver d'accès
   * en posant une `base_url` invalide.
   */
  readonly envBaseUrl: string;
}

/**
 * Tente de construire un host normalisé à partir d'une URL. Retourne
 * `null` quand l'URL est invalide — on filtre silencieusement les
 * lignes corrompues plutôt que de faire échouer la route entière.
 */
const safeHost = (raw: string): string | null => {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
};

export function registerAllowedHostsRoutes(
  app: FastifyInstance,
  options: RegisterAllowedHostsRoutesOptions,
): void {
  const { instanceConfig, envBaseUrl } = options;

  app.get('/allowed-hosts', async (_request, reply): Promise<AllowedHostsResponse> => {
    const config = await instanceConfig.getConfig();
    const candidates: (string | null)[] = [
      safeHost(envBaseUrl),
      config.baseUrl !== null ? safeHost(config.baseUrl) : null,
      ...config.additionalUrls.map((u) => safeHost(u.url)),
    ];

    const seen = new Set<string>();
    const hosts: string[] = [];
    for (const host of candidates) {
      if (host !== null && !seen.has(host)) {
        seen.add(host);
        hosts.push(host);
      }
    }

    void reply.header('cache-control', REVALIDATE_HEADER);
    return { hosts };
  });
}
