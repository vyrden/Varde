import type {
  OnboardingActionDefinition,
  OnboardingHint,
  OnboardingService,
} from '@varde/contracts';

import type { OnboardingExecutor } from './executor.js';

/**
 * Host qui matérialise `ctx.onboarding` pour les modules (PR 3.13).
 * Le service exposé via `host.service` est passé à `createCtxFactory` ;
 * les appels modules sont relayés vers l'executor partagé et vers une
 * map locale de hints.
 *
 * Le host n'est pas un contrat public — c'est le plomberie côté host
 * (server, harness) qui décide comment coller l'executor et le
 * registre de hints. Les modules ne voient que `OnboardingService`.
 */

export interface OnboardingHostService {
  /** Service exposé aux modules via `ctx.onboarding`. */
  readonly service: OnboardingService;
  /** Lecture du registre de hints (ordre d'insertion conservé). */
  readonly getHints: () => readonly OnboardingHint[];
  /** Lecture des types d'actions contribués par les modules. */
  readonly getContributedActionTypes: () => readonly string[];
}

export interface CreateOnboardingHostServiceOptions {
  readonly executor: OnboardingExecutor;
  /**
   * Hook optionnel appelé à chaque contribution de hint. Pratique
   * pour les tests qui veulent observer les writes sans exporter la
   * map. Ne remplace pas le stockage — le hint est toujours inséré
   * dans la map interne.
   */
  readonly onHintContributed?: (hint: OnboardingHint) => void;
}

export function createOnboardingHostService(
  options: CreateOnboardingHostServiceOptions,
): OnboardingHostService {
  const { executor, onHintContributed } = options;
  const hints = new Map<string, OnboardingHint>();
  const contributedActionTypes: string[] = [];

  const service: OnboardingService = Object.freeze({
    registerAction<P, R>(definition: OnboardingActionDefinition<P, R>): void {
      executor.registerAction(definition);
      contributedActionTypes.push(definition.type);
    },
    contributeHint(hint: OnboardingHint): void {
      hints.set(hint.id, hint);
      onHintContributed?.(hint);
    },
  });

  return {
    service,
    getHints: () => Array.from(hints.values()),
    getContributedActionTypes: () => [...contributedActionTypes],
  };
}
