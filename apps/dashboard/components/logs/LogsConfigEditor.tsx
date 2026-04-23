'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import type { LogsBrokenRoute } from '../../lib/api-client';
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
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-600 dark:bg-red-950 dark:text-red-100"
        >
          <p className="font-semibold">
            {props.brokenRoutes.length === 1
              ? '1 route cassée'
              : `${props.brokenRoutes.length} routes cassées`}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {props.brokenRoutes.map((r) => (
              <li key={r.routeId}>
                Salon <code className="rounded bg-red-100 px-1 dark:bg-red-900">{r.channelId}</code>
                , {r.bufferedCount} bufferisés, {r.droppedCount} perdus
                {r.reason !== null ? ` — ${r.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
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
