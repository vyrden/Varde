'use client';

import { Button } from '@varde/ui';
import { useState } from 'react';

import type { TestLogsRouteError } from '../../lib/logs-actions';
import { saveLogsConfig, testLogsRoute } from '../../lib/logs-actions';
import type {
  ChannelOption,
  LogsConfigClient,
  LogsExclusionsClient,
  LogsRouteClient,
  RoleOption,
} from './LogsConfigEditor';

/** Traduit un code d'erreur de la route test en phrase française. */
function formatTestReason(reason: TestLogsRouteError['reason']): string {
  switch (reason) {
    case 'channel-not-found':
      return 'Salon introuvable ou inaccessible par le bot.';
    case 'missing-permission':
      return 'Permissions manquantes (SendMessages ou EmbedLinks).';
    case 'rate-limit-exhausted':
      return 'Limite de débit Discord atteinte, réessaie dans quelques secondes.';
    case 'unknown':
      return 'Erreur inattendue, consulte les logs du serveur.';
  }
}

export interface LogsAdvancedModeProps {
  readonly guildId: string;
  readonly config: LogsConfigClient;
  readonly setConfig: (c: LogsConfigClient) => void;
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
}

/**
 * Ligne du tableau des routes.
 */
function RouteRow({
  route,
  channels,
  isTesting,
  onDelete,
  onTest,
}: {
  route: LogsRouteClient;
  channels: readonly ChannelOption[];
  isTesting: boolean;
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
            disabled={isTesting}
            aria-label={`Tester la route ${route.label}`}
          >
            {isTesting ? 'Test…' : 'Tester'}
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
        <li>
          Un champ d'embed Discord ne peut contenir que 1024 caractères. Au-delà, le contenu part
          automatiquement en pièce jointe <code>.txt</code> (jamais tronqué silencieusement).
        </li>
        <li>
          Un embed ne peut dépasser 6000 caractères au total (titre + description + champs + footer
          + author). Les champs les plus longs passent en pièce jointe prioritairement.
        </li>
        <li>
          Les pièces jointes sont limitées à 25 MB par Discord (tout plan guild confondu, borne
          conservatrice du bot).
        </li>
        <li>
          Les médias d'un message supprimé ne sont pas récupérables — les URLs CDN Discord expirent
          dès la suppression. L'embed contient le lien original, qui peut être mort.
        </li>
        <li>
          Si un salon cible devient indisponible, les événements sont bufferisés en RAM (100 par
          route max), puis perdus si le bot redémarre. La persistance Redis arrive en V1.2.
        </li>
      </ul>
    </div>
  );
}

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
}: LogsAdvancedModeProps) {
  const [routes, setRoutes] = useState<readonly LogsRouteClient[]>(config.routes);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  /** ID de la route en cours de test (null si aucun test en cours). */
  const [testingRouteId, setTestingRouteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  const syncRoutes = (next: readonly LogsRouteClient[]) => {
    setRoutes(next);
    setConfig({ ...config, routes: next });
  };

  const handleDeleteRoute = (id: string) => {
    syncRoutes(routes.filter((r) => r.id !== id));
  };

  const handleTestRoute = async (id: string) => {
    const route = routes.find((r) => r.id === id);
    if (!route) return;
    setTestingRouteId(id);
    setFeedback(null);
    const result = await testLogsRoute(guildId, route.channelId);
    setTestingRouteId(null);
    if (result.ok) {
      setFeedback({ kind: 'success', message: 'Test envoyé : va vérifier dans le salon.' });
    } else {
      setFeedback({ kind: 'error', message: `Échec : ${formatTestReason(result.reason)}` });
    }
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
      setFeedback({
        kind: 'error',
        message: result.issues[0]?.message ?? 'Erreur inconnue',
      });
    } else {
      setFeedback({ kind: 'success', message: 'Configuration enregistrée.' });
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
          <h3 className="text-sm font-semibold">Routes ({routes.length})</h3>
          <Button type="button" size="sm" onClick={handleAddRoute}>
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
                    isTesting={testingRouteId === route.id}
                    onDelete={() => handleDeleteRoute(route.id)}
                    onTest={() => void handleTestRoute(route.id)}
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
            feedback.kind === 'success'
              ? 'text-sm text-green-700 dark:text-green-400'
              : 'text-sm text-destructive'
          }
        >
          {feedback.message}
        </p>
      )}

      {/* Action globale Enregistrer */}
      <div className="flex items-center gap-3">
        <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
