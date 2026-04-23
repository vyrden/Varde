'use client';

import { Button } from '@varde/ui';
import { useState } from 'react';

import { saveLogsConfig } from '../../lib/logs-actions';
import type {
  ChannelOption,
  LogsConfigClient,
  LogsExclusionsClient,
  LogsRouteClient,
  RoleOption,
} from './LogsConfigEditor';

export interface LogsAdvancedModeProps {
  readonly guildId: string;
  readonly config: LogsConfigClient;
  readonly setConfig: (c: LogsConfigClient) => void;
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
  readonly onSwitchSimple: () => void;
}

/**
 * Ligne du tableau des routes. Les actions (tester, supprimer) sont des
 * placeholders câblés aux Tasks 7-8.
 */
function RouteRow({
  route,
  channels,
  onDelete,
  onTest,
}: {
  route: LogsRouteClient;
  channels: readonly ChannelOption[];
  onDelete: () => void;
  onTest: () => void;
}) {
  const channelName = channels.find((c) => c.id === route.channelId)?.name ?? route.channelId;

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 text-sm">{route.label}</td>
      <td className="px-3 py-2 text-sm">
        <span className="text-muted-foreground">{route.events.join(', ')}</span>
      </td>
      <td className="px-3 py-2 text-sm">#{channelName}</td>
      <td className="px-3 py-2 text-sm capitalize">{route.verbosity}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTest}
            aria-label={`Tester la route ${route.label}`}
          >
            Tester
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label={`Supprimer la route ${route.label}`}
            className="text-destructive hover:text-destructive"
          >
            Supprimer
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Éditeur de la liste d'exclusions (IDs séparés par virgule). */
function ExclusionsEditor({
  exclusions,
  roles,
  onChange,
}: {
  exclusions: LogsExclusionsClient;
  roles: readonly RoleOption[];
  onChange: (e: LogsExclusionsClient) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Exclusions</h3>

      {/* Utilisateurs */}
      <div className="space-y-1">
        <label htmlFor="excl-users" className="block text-sm font-medium">
          IDs utilisateurs exclus
        </label>
        <input
          id="excl-users"
          type="text"
          defaultValue={exclusions.userIds.join(', ')}
          onBlur={(e) => {
            const ids = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ ...exclusions, userIds: ids });
          }}
          placeholder="123456789, 987654321"
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="IDs utilisateurs exclus, séparés par des virgules"
        />
      </div>

      {/* Rôles */}
      <div className="space-y-1">
        <label htmlFor="excl-roles" className="block text-sm font-medium">
          Rôles exclus
        </label>
        <select
          id="excl-roles"
          multiple
          size={Math.min(roles.length + 1, 5)}
          value={[...exclusions.roleIds]}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange({ ...exclusions, roleIds: selected });
          }}
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Rôles exclus (sélection multiple)"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Salons exclus */}
      <div className="space-y-1">
        <label htmlFor="excl-channels" className="block text-sm font-medium">
          IDs salons exclus
        </label>
        <input
          id="excl-channels"
          type="text"
          defaultValue={exclusions.channelIds.join(', ')}
          onBlur={(e) => {
            const ids = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ ...exclusions, channelIds: ids });
          }}
          placeholder="123456789, 987654321"
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="IDs salons exclus, séparés par des virgules"
        />
      </div>

      {/* Exclure les bots */}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={exclusions.excludeBots}
          onChange={(e) => onChange({ ...exclusions, excludeBots: e.target.checked })}
          className="h-4 w-4 rounded text-primary"
          aria-label="Exclure les bots des logs"
        />
        Exclure les bots des logs
      </label>
    </div>
  );
}

/** Encart informatif sur les limites techniques du module logs. */
function LimitsNotice() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">Limites techniques</p>
      <ul className="mt-2 list-inside list-disc space-y-1">
        <li>Maximum 10 routes par guild.</li>
        <li>
          En cas de salon inaccessible, les événements sont bufferisés 5 minutes puis abandonnés.
        </li>
        <li>
          Verbosité compacte : 1 champ par événement. Détaillée : tous les champs disponibles.
        </li>
        <li>Les exclusions s'appliquent à toutes les routes.</li>
      </ul>
    </div>
  );
}

const MAX_ROUTES = 10;

/**
 * Mode avancé : tableau des routes + exclusions + encart limites.
 * Les server actions (créer, tester, supprimer une route) sont des
 * placeholders câblés aux Tasks 7-8.
 */
export function LogsAdvancedMode({
  guildId,
  config,
  setConfig,
  channels,
  roles,
  onSwitchSimple,
}: LogsAdvancedModeProps) {
  const [routes, setRoutes] = useState<readonly LogsRouteClient[]>(config.routes);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const syncRoutes = (next: readonly LogsRouteClient[]) => {
    setRoutes(next);
    setConfig({ ...config, routes: next });
  };

  const handleDeleteRoute = (id: string) => {
    syncRoutes(routes.filter((r) => r.id !== id));
  };

  const handleTestRoute = (id: string) => {
    /* Placeholder — câblé à la Task 8 */
    console.warn(`LogsAdvancedMode.handleTestRoute(${id}) non câblé — Task 8`);
  };

  const handleAddRoute = () => {
    /* Placeholder — câblé à la Task 7 */
    console.warn('LogsAdvancedMode.handleAddRoute non câblé — Task 7');
  };

  const handleExclusionsChange = (exclusions: LogsExclusionsClient) => {
    setConfig({ ...config, exclusions });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    const result = await saveLogsConfig(guildId, config);
    setIsSaving(false);
    if (!result.ok) {
      setFeedback(result.issues[0]?.message ?? 'Erreur inconnue');
    } else {
      setFeedback('Configuration enregistrée.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Configuration avancée des logs</h2>
        <p className="text-sm text-muted-foreground">
          Définissez plusieurs routes avec des événements et salons distincts.
        </p>
      </div>

      {/* Tableau des routes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Routes ({routes.length} / {MAX_ROUTES})
          </h3>
          <Button
            type="button"
            size="sm"
            onClick={handleAddRoute}
            disabled={routes.length >= MAX_ROUTES}
          >
            + Nouvelle route
          </Button>
        </div>

        {routes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aucune route configurée.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Événements</th>
                  <th className="px-3 py-2">Salon</th>
                  <th className="px-3 py-2">Verbosité</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <RouteRow
                    key={route.id}
                    route={route}
                    channels={channels}
                    onDelete={() => handleDeleteRoute(route.id)}
                    onTest={() => handleTestRoute(route.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exclusions */}
      <ExclusionsEditor
        exclusions={config.exclusions}
        roles={roles}
        onChange={handleExclusionsChange}
      />

      {/* Limites techniques */}
      <LimitsNotice />

      {/* Retour d'action */}
      {feedback !== null && (
        <p
          role="status"
          className={
            feedback === 'Configuration enregistrée.'
              ? 'text-sm text-green-700 dark:text-green-400'
              : 'text-sm text-destructive'
          }
        >
          {feedback}
        </p>
      )}

      {/* Action globale Enregistrer */}
      <div className="flex items-center gap-3">
        <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {/* Lien mode simple */}
      <p className="text-sm">
        <button
          type="button"
          onClick={onSwitchSimple}
          className="text-primary underline-offset-4 hover:underline"
        >
          ← Mode simple
        </button>
      </p>
    </div>
  );
}
