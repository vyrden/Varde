'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

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

  const setMode = (next: 'simple' | 'advanced') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'advanced') {
      params.set('mode', 'advanced');
    } else {
      params.delete('mode');
    }
    router.replace(`?${params.toString()}`);
  };

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

      {mode === 'simple' ? (
        <LogsSimpleMode
          guildId={props.guildId}
          config={config}
          setConfig={setConfig}
          channels={props.channels}
          onSwitchAdvanced={() => setMode('advanced')}
        />
      ) : (
        <LogsAdvancedMode
          guildId={props.guildId}
          config={config}
          setConfig={setConfig}
          channels={props.channels}
          roles={props.roles}
          onSwitchSimple={() => setMode('simple')}
        />
      )}
    </section>
  );
}
