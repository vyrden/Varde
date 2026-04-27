'use client';

import { useRouter } from 'next/navigation';
import { type ReactElement, useState, useTransition } from 'react';

import type { LogsBrokenRoute } from '../../lib/api-client';
import { replayBrokenRoute } from '../../lib/logs-actions';

/**
 * Bannière des routes "cassées" — routes qui ont accumulé des events
 * en buffer parce que le bot n'a pas pu publier (channel introuvable,
 * permissions manquantes…). Permet à l'admin de rejouer les events
 * bufferisés ou de les ignorer.
 *
 * Composant extrait de l'ancien `LogsConfigEditor` lors de la refonte
 * en page unique — pas de changement fonctionnel.
 */

type ReplayFeedback =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | {
      readonly kind: 'success';
      readonly replayed: number;
      readonly failed: number;
    }
  | { readonly kind: 'error'; readonly message: string };

const reasonLabel = (reason: 'service-unavailable' | 'permission-denied' | 'unknown'): string => {
  switch (reason) {
    case 'service-unavailable':
      return 'Service indisponible côté bot. Réessaie quand le bot sera reconnecté.';
    case 'permission-denied':
      return 'Permissions manquantes pour rejouer cette route.';
    case 'unknown':
      return 'Erreur inattendue. Consulte les logs côté serveur.';
  }
};

function BrokenRouteRow({
  guildId,
  route,
}: {
  readonly guildId: string;
  readonly route: LogsBrokenRoute;
}): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ReplayFeedback>({ kind: 'idle' });

  const handleReplay = (): void => {
    setFeedback({ kind: 'pending' });
    startTransition(async () => {
      const result = await replayBrokenRoute(guildId, route.routeId);
      if (!result.ok) {
        setFeedback({ kind: 'error', message: reasonLabel(result.reason) });
        return;
      }
      setFeedback({ kind: 'success', replayed: result.replayed, failed: result.failed });
      if (result.failed === 0) router.refresh();
    });
  };

  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span>
          Salon <code className="rounded bg-red-100 px-1 dark:bg-red-900">{route.channelId}</code>,{' '}
          {route.bufferedCount} bufferisés, {route.droppedCount} perdus
          {route.reason !== null ? ` — ${route.reason}` : ''}
        </span>
        <button
          type="button"
          onClick={handleReplay}
          disabled={pending || feedback.kind === 'pending'}
          aria-label={`Rejouer les events bufferisés de la route ${route.routeId}`}
          className="rounded border border-red-400 bg-white px-2 py-1 text-sm font-medium hover:bg-red-100 disabled:opacity-50 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
        >
          {pending || feedback.kind === 'pending' ? 'Rejeu…' : 'Rejouer'}
        </button>
      </div>
      {feedback.kind === 'success' && feedback.failed === 0 && (
        <p className="text-sm text-green-700 dark:text-green-300">
          {feedback.replayed} events rejoués avec succès.
        </p>
      )}
      {feedback.kind === 'success' && feedback.failed > 0 && (
        <p className="text-sm text-orange-700 dark:text-orange-300">
          {feedback.replayed} rejoué{feedback.replayed > 1 ? 's' : ''}, {feedback.failed} encore en
          échec. Vérifie les permissions et retente plus tard.
        </p>
      )}
      {feedback.kind === 'error' && (
        <p className="text-sm text-red-700 dark:text-red-300">{feedback.message}</p>
      )}
    </li>
  );
}

export interface BrokenRoutesBannerProps {
  readonly guildId: string;
  readonly brokenRoutes: readonly LogsBrokenRoute[];
}

export function BrokenRoutesBanner({
  guildId,
  brokenRoutes,
}: BrokenRoutesBannerProps): ReactElement | null {
  if (brokenRoutes.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-600 dark:bg-red-950 dark:text-red-100"
    >
      <p className="font-semibold">
        {brokenRoutes.length === 1 ? '1 route cassée' : `${brokenRoutes.length} routes cassées`}
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {brokenRoutes.map((r) => (
          <BrokenRouteRow key={r.routeId} guildId={guildId} route={r} />
        ))}
      </ul>
    </div>
  );
}
