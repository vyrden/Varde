/**
 * Helpers purs du démarrage de `apps/server`. Extraits de `bin.ts` pour
 * être unit-testables sans monter une instance complète.
 *
 * - `resolveBaseUrl` : auto-détection de `VARDE_BASE_URL` depuis l'env,
 *   avec défaut `http://localhost:3000` (HTTP_PORT par défaut du
 *   dashboard Next.js). C'est l'URL via laquelle les utilisateurs
 *   accèdent au dashboard ; sert au callback OAuth Discord et au
 *   message d'invitation au wizard.
 *
 * - `decideLoginPlan` : décide si la gateway Discord doit être
 *   connectée au boot, et avec quel token. Trois issues possibles :
 *   - `db` : `instance_config.setup_completed_at` est posé et un token
 *     déchiffré est disponible — chemin nominal post-wizard.
 *   - `env` : la setup n'est pas terminée mais `VARDE_DISCORD_TOKEN`
 *     est dans l'environnement — chemin de transition pour les dev
 *     setups antérieurs au wizard. Sera retiré quand le wizard aura
 *     été propagé à toutes les instances en cours.
 *   - `wait` : aucun token utilisable, le bot reste hors-ligne en
 *     attendant que l'admin termine `/setup`. Un listener `onReady`
 *     du `instanceConfigService` se chargera de la connexion au
 *     moment du `complete()`.
 */

/**
 * Résout l'URL d'accès au dashboard à partir de la valeur env brute.
 * Trim les espaces, traite la chaîne vide comme absente. Défaut :
 * `http://localhost:3000`.
 */
export function resolveBaseUrl(raw: string | undefined): string {
  if (typeof raw !== 'string') {
    return 'http://localhost:3000';
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? 'http://localhost:3000' : trimmed;
}

/** Entrée de `decideLoginPlan`. */
export interface LoginPlanInput {
  /** `instance_config.setup_completed_at IS NOT NULL`. */
  readonly configured: boolean;
  /** Token bot déchiffré depuis `instance_config`, si présent. */
  readonly dbToken: string | null;
  /** Token bot lu depuis `VARDE_DISCORD_TOKEN`, si présent. */
  readonly envToken: string | null;
  /** URL d'accès au dashboard, utilisée dans le message d'attente. */
  readonly baseUrl: string;
}

/** Sortie de `decideLoginPlan`. */
export type LoginPlan =
  | { readonly kind: 'db'; readonly token: string }
  | { readonly kind: 'env'; readonly token: string }
  | { readonly kind: 'wait'; readonly message: string };

/**
 * Décide la stratégie de login Discord à partir de l'état d'instance
 * et de l'environnement. Voir le bloc-doc en tête du module pour le
 * contrat des trois cas.
 */
export function decideLoginPlan(input: LoginPlanInput): LoginPlan {
  if (input.configured && input.dbToken !== null) {
    return { kind: 'db', token: input.dbToken };
  }
  if (!input.configured && input.envToken !== null) {
    return { kind: 'env', token: input.envToken };
  }
  return {
    kind: 'wait',
    message: `Instance non configurée, en attente du wizard. Ouvrez ${input.baseUrl}/setup pour démarrer.`,
  };
}
