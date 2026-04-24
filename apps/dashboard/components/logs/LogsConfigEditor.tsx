'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState, useTransition } from 'react';

import type { LogsBrokenRoute } from '../../lib/api-client';
import { replayBrokenRoute } from '../../lib/logs-actions';
import { LogsAdvancedMode } from './LogsAdvancedMode';
import { LogsSimpleMode } from './LogsSimpleMode';

/** Types clients miroirs de la config (le vrai schéma Zod vit dans modules/logs). */
export interface LogsConfigClient {
  readonly version: 1;
  readonly routes: readonly LogsRouteClient[];
  readonly exclusions: LogsExclusionsClient;
}

export interface LogsRouteClient {
  readonly id: string;
  readonly label: string;
  readonly events: readonly string[];
  readonly channelId: string;
  readonly verbosity: 'compact' | 'detailed';
}

export interface LogsExclusionsClient {
  readonly userIds: readonly string[];
  readonly roleIds: readonly string[];
  readonly channelIds: readonly string[];
  readonly excludeBots: boolean;
}

export interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface LogsConfigEditorProps {
  readonly guildId: string;
  readonly initialConfig: LogsConfigClient;
  readonly brokenRoutes: readonly LogsBrokenRoute[];
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
}

/** IDs ARIA des panneaux associés aux onglets. */
const TAB_PANEL_SIMPLE = 'logs-panel-simple';
const TAB_PANEL_ADVANCED = 'logs-panel-advanced';

/**
 * Barre d'onglets Simple / Avancé accessible (WCAG AA).
 * Navigation clavier : flèche gauche/droite entre les onglets.
 */
function ModeTabs({
  mode,
  onSelect,
}: {
  readonly mode: 'simple' | 'advanced';
  readonly onSelect: (m: 'simple' | 'advanced') => void;
}) {
  const tabSimpleRef = useRef<HTMLButtonElement>(null);
  const tabAdvancedRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, current: 'simple' | 'advanced') => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = current === 'simple' ? 'advanced' : 'simple';
        onSelect(next);
        /* Déplace le focus sur l'onglet activé */
        const ref = next === 'simple' ? tabSimpleRef : tabAdvancedRef;
        ref.current?.focus();
      }
    },
    [onSelect],
  );

  return (
    <div
      role="tablist"
      aria-label="Mode d'édition"
      className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit"
    >
      <button
        ref={tabSimpleRef}
        role="tab"
        type="button"
        id="logs-tab-simple"
        aria-selected={mode === 'simple'}
        aria-controls={TAB_PANEL_SIMPLE}
        tabIndex={mode === 'simple' ? 0 : -1}
        onClick={() => onSelect('simple')}
        onKeyDown={(e) => handleKeyDown(e, 'simple')}
        className={
          mode === 'simple'
            ? 'rounded-md px-4 py-1.5 text-sm font-medium bg-background text-foreground shadow-sm'
            : 'rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
        }
      >
        Mode simple
      </button>
      <button
        ref={tabAdvancedRef}
        role="tab"
        type="button"
        id="logs-tab-advanced"
        aria-selected={mode === 'advanced'}
        aria-controls={TAB_PANEL_ADVANCED}
        tabIndex={mode === 'advanced' ? 0 : -1}
        onClick={() => onSelect('advanced')}
        onKeyDown={(e) => handleKeyDown(e, 'advanced')}
        className={
          mode === 'advanced'
            ? 'rounded-md px-4 py-1.5 text-sm font-medium bg-background text-foreground shadow-sm'
            : 'rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
        }
      >
        Mode avancé
      </button>
    </div>
  );
}

/**
 * Coordinateur éditeur de config logs. Gère le switch simple/avancé
 * via le paramètre URL `?mode=advanced` et tient l'état local de la
 * config avant enregistrement.
 */
/** Feedback inline du replay pour une route donnée. */
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
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ReplayFeedback>({ kind: 'idle' });

  const handleReplay = () => {
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

function BrokenRoutesBanner({
  guildId,
  brokenRoutes,
}: {
  readonly guildId: string;
  readonly brokenRoutes: readonly LogsBrokenRoute[];
}) {
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

export function LogsConfigEditor(props: LogsConfigEditorProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = searchParams.get('mode') === 'advanced' ? 'advanced' : 'simple';
  const [config, setConfig] = useState<LogsConfigClient>(props.initialConfig);

  const setMode = useCallback(
    (next: 'simple' | 'advanced') => {
      const params = new URLSearchParams(searchParams);
      if (next === 'advanced') {
        params.set('mode', 'advanced');
      } else {
        params.delete('mode');
      }
      router.replace(`?${params.toString()}`);
    },
    [searchParams, router],
  );

  return (
    <section className="space-y-6">
      {props.brokenRoutes.length > 0 && (
        <BrokenRoutesBanner guildId={props.guildId} brokenRoutes={props.brokenRoutes} />
      )}

      {/* Onglets Simple / Avancé */}
      <ModeTabs mode={mode} onSelect={setMode} />

      {/* Panneau simple */}
      <div
        role="tabpanel"
        id={TAB_PANEL_SIMPLE}
        aria-labelledby="logs-tab-simple"
        hidden={mode !== 'simple'}
      >
        {mode === 'simple' && (
          <LogsSimpleMode
            guildId={props.guildId}
            config={config}
            setConfig={setConfig}
            channels={props.channels ?? []}
          />
        )}
      </div>

      {/* Panneau avancé */}
      <div
        role="tabpanel"
        id={TAB_PANEL_ADVANCED}
        aria-labelledby="logs-tab-advanced"
        hidden={mode !== 'advanced'}
      >
        {mode === 'advanced' && (
          <LogsAdvancedMode
            guildId={props.guildId}
            config={config}
            setConfig={setConfig}
            channels={props.channels ?? []}
            roles={props.roles ?? []}
          />
        )}
      </div>
    </section>
  );
}
