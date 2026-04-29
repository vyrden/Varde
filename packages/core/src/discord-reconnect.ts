import type { Logger } from '@varde/contracts';

/**
 * `discordReconnectService` (jalon 7 PR 7.2). Coordonne le swap à
 * chaud d'un token bot Discord pour le client gateway.
 *
 * Le service est volontairement découplé de `discord.js` : on
 * accepte un `handler` générique `(token) => Promise<void>` que
 * `apps/bot` câble sur la création/login d'un nouveau `Client`.
 * Ce découpage isole la logique de coordination (mutex, timeout,
 * propagation d'erreur) du runtime gateway, et permet de la
 * tester en isolation avec un handler synthétique.
 *
 * Trois propriétés contractuelles :
 *
 * - **Mutex** : deux appels concurrents à `reconnect()` ne se
 *   chevauchent jamais — le second attend la fin du premier
 *   (sérialisation FIFO via promise chain). Empêche un double
 *   `client.login` ou un swap incohérent quand l'admin enchaîne
 *   deux changements de token rapides.
 *
 * - **Timeout** : le handler est mis en course contre une
 *   horloge (défaut 30 s). Au-delà, `reconnect()` retourne
 *   `{ ok: false, error: 'timeout' }`. Le handler peut continuer
 *   en arrière-plan — c'est sa responsabilité de nettoyer
 *   d'éventuels clients à moitié connectés. Le service ne tente
 *   pas d'abort un `client.login` en cours (l'API discord.js ne
 *   le permet pas proprement).
 *
 * - **Pas d'effet de bord en cas d'échec** : le service ne touche
 *   à rien d'autre que le handler. La persistance du nouveau
 *   token (`instance_config.discord_bot_token_*`) est réalisée
 *   par l'appelant (route admin), conditionnellement à `ok=true`.
 *   C'est cette discipline qui matérialise le rollback : un
 *   échec ici implique que le token n'est jamais persisté, donc
 *   l'instance reste sur l'ancienne valeur.
 */

/**
 * Effectue la reconnexion gateway avec un nouveau token. Doit
 * throw en cas d'échec (login refusé, intent manquant, etc.).
 * Le service serialise l'appel et applique un timeout.
 */
export type DiscordReconnectHandler = (token: string) => Promise<void>;

export interface DiscordReconnectResult {
  readonly ok: boolean;
  /** Message court agrégeant la cause de l'échec (`'timeout'`, message d'erreur du handler…). */
  readonly error?: string;
}

export interface DiscordReconnectService {
  readonly reconnect: (token: string) => Promise<DiscordReconnectResult>;
}

export interface CreateDiscordReconnectServiceOptions {
  readonly handler: DiscordReconnectHandler;
  readonly logger: Logger;
  /** Timeout en millisecondes. Défaut : 30 000 (30 s). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function createDiscordReconnectService(
  options: CreateDiscordReconnectServiceOptions,
): DiscordReconnectService {
  const { handler, logger } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = logger.child({ component: 'discord-reconnect' });

  // Chaîne de sérialisation. Chaque nouvel appel s'enchaîne sur
  // la précédente pour garantir l'absence de chevauchement. On
  // catch sur la précédente afin qu'une erreur n'empoisonne pas
  // les suivantes — chaque `reconnect()` reçoit son propre
  // résultat, indépendamment des appels antérieurs.
  let queue: Promise<unknown> = Promise.resolve();

  const runOnce = async (token: string): Promise<DiscordReconnectResult> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      });
      await Promise.race([handler(token), timeoutPromise]);
      log.info('Discord reconnect succeeded');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Discord reconnect failed', { error: message });
      return { ok: false, error: message };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  return {
    reconnect: (token) => {
      const job = queue.then(() => runOnce(token));
      queue = job.catch(() => undefined);
      return job;
    },
  };
}
