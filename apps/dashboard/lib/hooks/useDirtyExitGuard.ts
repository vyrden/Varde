'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook de protection contre la perte de modifications. Pose un
 * listener `beforeunload` quand `dirty=true` — le navigateur affiche
 * sa boîte de dialogue native au refresh / fermeture / navigation
 * externe.
 *
 * Pour les actions internes (clic sur Annuler, Retour, etc.), expose
 * `confirmIfDirty(action)` :
 * - Si `dirty=false` → exécute `action()` immédiatement.
 * - Si `dirty=true`  → affiche un `window.confirm()` avec message
 *   standard ; n'exécute `action()` que si l'utilisateur confirme.
 *
 * Ce pattern évite l'introduction d'un dialog modal custom — le
 * `confirm()` natif suffit pour ce cas et reste accessible au clavier.
 * Les composants qui veulent un dialog custom branchent leur propre
 * UX et n'utilisent que la garde `beforeunload`.
 */

const DEFAULT_PROMPT_MESSAGE = 'Tu as des modifications non sauvegardées. Quitter quand même ?';

export interface UseDirtyExitGuardOptions {
  /** Message dans le `confirm()` interne. Le navigateur ignore le
   * message custom dans `beforeunload` (sécurité), seul l'affichage
   * d'un dialog est garanti. */
  readonly promptMessage?: string;
}

export interface DirtyExitGuard {
  /**
   * Exécute `action` immédiatement si pas de modifications, sinon
   * demande confirmation via `window.confirm()`. Retourne `true`
   * si l'action a été exécutée, `false` si l'utilisateur a annulé.
   */
  readonly confirmIfDirty: (action: () => void) => boolean;
}

export function useDirtyExitGuard(
  dirty: boolean,
  options: UseDirtyExitGuardOptions = {},
): DirtyExitGuard {
  const promptMessage = options.promptMessage ?? DEFAULT_PROMPT_MESSAGE;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      // Spec moderne : `event.preventDefault()` + setter `returnValue`
      // (legacy) — les navigateurs ignorent le texte custom mais
      // affichent leur propre warning.
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const confirmIfDirty = useCallback(
    (action: () => void): boolean => {
      if (!dirtyRef.current) {
        action();
        return true;
      }
      const ok =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(promptMessage)
          : true;
      if (ok) action();
      return ok;
    },
    [promptMessage],
  );

  return { confirmIfDirty };
}
