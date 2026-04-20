import type { Logger } from '@varde/contracts';

/**
 * Coordinateur d'arrêt propre. Enregistre des étapes dans l'ordre
 * déclaratif ; `run()` les exécute dans l'ordre inverse (dernière
 * ouverte, première fermée — pattern RAII).
 *
 * Chaque étape est exécutée même si la précédente échoue : les
 * erreurs sont loguées, jamais rethrown. Le but est de ne jamais
 * laisser de ressource partiellement fermée parce qu'un handler
 * précédent a jeté.
 *
 * `bindSignals()` branche une instance de coordinator aux signaux
 * POSIX `SIGINT` / `SIGTERM` en prod. Les tests appellent `run()`
 * directement.
 */

export interface ShutdownStep {
  readonly name: string;
  readonly run: () => Promise<void> | void;
}

export interface ShutdownCoordinator {
  readonly register: (step: ShutdownStep) => void;
  readonly run: () => Promise<void>;
}

export interface CreateShutdownOptions {
  readonly logger: Logger;
}

export function createShutdownCoordinator(options: CreateShutdownOptions): ShutdownCoordinator {
  const logger = options.logger.child({ component: 'shutdown' });
  const steps: ShutdownStep[] = [];
  let running = false;

  return {
    register(step) {
      steps.push(step);
    },
    async run() {
      if (running) return;
      running = true;
      for (const step of [...steps].reverse()) {
        try {
          await step.run();
          logger.info('arrêt étape OK', { step: step.name });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.warn('arrêt étape en échec', { step: step.name, error: err.message });
        }
      }
    },
  };
}

/**
 * Branche un coordinator aux signaux SIGINT/SIGTERM. Retourne une
 * fonction pour détacher les handlers (tests).
 */
export function bindSignals(coordinator: ShutdownCoordinator): () => void {
  const handler = (): void => {
    void coordinator.run();
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}
