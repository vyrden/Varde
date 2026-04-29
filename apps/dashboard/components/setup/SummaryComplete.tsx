'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useActionState, useEffect } from 'react';

import { type SetupActionState, submitComplete } from '../../lib/setup-actions';
import type { CompleteResponse } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';

/**
 * Composant de finalisation du wizard (étape 7 — `summary`). Bouton
 * « Démarrer Varde » qui déclenche `POST /setup/complete` et navigue
 * vers `/` une fois le bot connecté à Discord. Trois cas de retour :
 *
 * - `{ ok: true }` : connexion gateway établie dans la fenêtre de
 *   30 s. On route vers `/` et le middleware (qui voit désormais
 *   `setup_completed_at` posé) laisse passer.
 * - `{ ok: false, error: 'timeout' }` : la setup EST persistée
 *   (`setup_completed_at` posé en DB), mais la connexion gateway
 *   n'a pas terminé dans la fenêtre. On le signale à l'admin avec
 *   un Continue manuel pour qu'il aille voir les logs au besoin.
 * - erreur API : bandeau rouge, l'admin reste sur la page.
 */

export interface SummaryCompleteCopy {
  readonly start: string;
  readonly previous: string;
  readonly successMessage: string;
  readonly successContinue: string;
  readonly timeoutMessage: string;
  readonly timeoutContinue: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initial: SetupActionState<CompleteResponse> = { kind: 'idle' };

export function SummaryComplete({ copy }: { readonly copy: SummaryCompleteCopy }): ReactElement {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitComplete, initial);

  // Redirection automatique sur succès complet (gateway prête). Le
  // timeout est géré manuellement plus bas — l'admin garde la main
  // pour décider quand quitter le wizard.
  useEffect(() => {
    if (state.kind === 'success' && state.data.ok) {
      router.push('/');
      router.refresh();
    }
  }, [state, router]);

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const timedOut = state.kind === 'success' && !state.data.ok;
  const completed = state.kind === 'success' && state.data.ok;

  return (
    <div className="space-y-6">
      <form action={action}>
        <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
          <Link
            href={setupStepHref('identity')}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copy.previous}
          </Link>
          <button
            type="submit"
            disabled={pending || completed}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="summary-start"
          >
            {pending ? '…' : copy.start}
          </button>
        </div>
      </form>

      {errorMessage !== null ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          data-testid="summary-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {timedOut ? (
        <div
          className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3"
          data-testid="summary-timeout"
        >
          <p className="text-sm text-amber-100">{copy.timeoutMessage}</p>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {copy.timeoutContinue}
          </Link>
        </div>
      ) : null}

      {completed ? (
        <div
          className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          data-testid="summary-success"
        >
          {copy.successMessage}
        </div>
      ) : null}
    </div>
  );
}
