'use client';

import { Badge, Button, Input, Label, Select } from '@varde/ui';
import { type FormEvent, type ReactElement, useState } from 'react';

import { testLogsRoute } from '../../lib/logs-actions';
import { ALL_EVENT_IDS, EVENT_LABEL } from './event-catalog';
import type { ChannelOption, LogsRouteClient } from './LogsConfigEditor';

const EVENTS = ALL_EVENT_IDS;
const EVENT_LABELS = EVENT_LABEL;

/**
 * Sous-section « Routes de destination » de la configuration avancée.
 * Permet à l'admin de dispatcher différents events vers différents
 * salons (ex. messages supprimés → #moderation-logs, arrivées → #welcome).
 *
 * Code extrait de l'ancien `LogsAdvancedMode` lors de la refonte
 * single-page. Le test par-route (`testLogsRoute`) reste local à
 * cette sous-section ; le test global du salon de destination est
 * géré par la `StickyActionBar` dans le shell.
 *
 * Routes spéciales : la route `SIMPLE_ROUTE_ID` représente le salon
 * de destination configuré dans la section principale. Elle n'est
 * PAS affichée ici (filtrée par le shell avant passage en props) —
 * seules les routes additionnelles apparaissent.
 */

interface RouteDraft {
  label: string;
  events: readonly string[];
  channelId: string;
  verbosity: 'compact' | 'detailed';
}

const emptyDraft = (): RouteDraft => ({
  label: '',
  events: [],
  channelId: '',
  verbosity: 'detailed',
});

const isDraftValid = (d: RouteDraft): boolean =>
  d.label.trim() !== '' && d.events.length > 0 && d.channelId !== '';

function PencilIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M4 2.5v9l7-4.5-7-4.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.7 8h5.6l.7-8M6 6.5v4M8 6.5v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 7.5l3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3.5 3.5l7 7M10.5 3.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RouteIcon(): ReactElement {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="26" cy="26" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 6h7a5 5 0 015 5v6a5 5 0 005 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatTestReason(reason: string): string {
  switch (reason) {
    case 'channel-not-found':
      return 'Salon introuvable ou inaccessible par le bot.';
    case 'missing-permission':
      return 'Permissions manquantes (SendMessages ou EmbedLinks).';
    case 'rate-limit-exhausted':
      return 'Limite de débit Discord atteinte, réessaie dans quelques secondes.';
    default:
      return 'Erreur inattendue, consulte les logs du serveur.';
  }
}

interface RouteRowProps {
  readonly route: LogsRouteClient;
  readonly channels: readonly ChannelOption[];
  readonly isTesting: boolean;
  readonly onDelete: () => void;
  readonly onTest: () => void;
  readonly onUpdate: (updated: LogsRouteClient) => void;
}

function RouteRow({
  route,
  channels,
  isTesting,
  onDelete,
  onTest,
  onUpdate,
}: RouteRowProps): ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<RouteDraft>({
    label: route.label,
    events: [...route.events],
    channelId: route.channelId,
    verbosity: route.verbosity,
  });

  const channelName = channels.find((c) => c.id === route.channelId)?.name ?? route.channelId;

  const handleEdit = (): void => {
    setDraft({
      label: route.label,
      events: [...route.events],
      channelId: route.channelId,
      verbosity: route.verbosity,
    });
    setIsEditing(true);
  };

  const handleCancel = (): void => setIsEditing(false);

  const handleValidate = (): void => {
    if (!isDraftValid(draft)) return;
    onUpdate({ ...route, ...draft });
    setIsEditing(false);
  };

  const toggleEvent = (ev: string): void => {
    setDraft((prev) => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter((e) => e !== ev) : [...prev.events, ev],
    }));
  };

  if (isEditing) {
    return (
      <tr className="border-b border-border bg-surface-active/30 last:border-0">
        <td className="px-3 py-2 align-top">
          <Input
            type="text"
            value={draft.label}
            maxLength={64}
            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
            aria-label="Label de la route"
          />
        </td>
        <td className="px-3 py-2 align-top">
          <fieldset>
            <legend className="sr-only">Événements de la route</legend>
            <div className="flex flex-col gap-1">
              {EVENTS.map((ev) => (
                <label key={ev} className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="h-3.5 w-3.5 rounded"
                    aria-label={EVENT_LABELS[ev] ?? ev}
                  />
                  {EVENT_LABELS[ev] ?? ev}
                </label>
              ))}
            </div>
          </fieldset>
        </td>
        <td className="px-3 py-2 align-top">
          <Select
            value={draft.channelId}
            onChange={(e) => setDraft((prev) => ({ ...prev, channelId: e.target.value }))}
            aria-label="Salon de destination"
          >
            <option value="">— Choisir —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-3 py-2 align-top">
          <Select
            value={draft.verbosity}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                verbosity: e.target.value as 'compact' | 'detailed',
              }))
            }
            aria-label="Verbosité de la route"
            title="Compact : une ligne par événement. Détaillé : embed complet avec tous les champs."
          >
            <option value="compact">Compact</option>
            <option value="detailed">Détaillé</option>
          </Select>
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleValidate}
              disabled={!isDraftValid(draft)}
              aria-label="Valider les modifications"
              title="Valider"
            >
              <CheckIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              aria-label="Annuler les modifications"
              title="Annuler"
            >
              <CloseIcon />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-3 text-sm font-medium text-foreground">{route.label}</td>
      <td className="max-w-xs px-3 py-3" title={route.events.join(', ')}>
        <code className="block truncate font-mono text-xs text-muted-foreground">
          {route.events.join(', ')}
        </code>
      </td>
      <td className="px-3 py-3">
        <Badge variant="outline" className="font-normal">
          #{channelName}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <Badge variant={route.verbosity === 'detailed' ? 'default' : 'inactive'}>
          {route.verbosity}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleEdit}
            aria-label={`Éditer la route ${route.label}`}
            title="Éditer"
          >
            <PencilIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onTest}
            disabled={isTesting}
            aria-label={`Tester la route ${route.label}`}
            title="Tester"
          >
            <PlayIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Supprimer la route ${route.label}`}
            title="Supprimer"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <TrashIcon />
          </Button>
        </div>
      </td>
    </tr>
  );
}

interface AddRouteFormProps {
  readonly channels: readonly ChannelOption[];
  readonly onAdd: (draft: RouteDraft) => void;
  readonly onCancel: () => void;
}

function AddRouteForm({ channels, onAdd, onCancel }: AddRouteFormProps): ReactElement {
  const [draft, setDraft] = useState<RouteDraft>(emptyDraft);

  const toggleEvent = (ev: string): void => {
    setDraft((prev) => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter((e) => e !== ev) : [...prev.events, ev],
    }));
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!isDraftValid(draft)) return;
    onAdd(draft);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-dashed border-primary/40 bg-surface-active/20 p-4"
      aria-label="Formulaire d'ajout de route"
    >
      <p className="text-sm font-semibold text-foreground">Nouvelle route</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="new-route-label">Label</Label>
          <Input
            id="new-route-label"
            type="text"
            value={draft.label}
            maxLength={64}
            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="ex : Modération"
            required
            aria-label="Label de la nouvelle route (64 caractères max)"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-route-channel">Salon</Label>
          <Select
            id="new-route-channel"
            value={draft.channelId}
            onChange={(e) => setDraft((prev) => ({ ...prev, channelId: e.target.value }))}
            required
            aria-label="Salon de destination de la route"
          >
            <option value="">— Choisir un salon —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium" id="new-route-events-label">
          Événements
          <span
            className="ml-1 text-xs text-muted-foreground"
            title="Sélectionne les types d'événements Discord à envoyer sur cette route."
          >
            (au moins 1)
          </span>
        </p>
        <fieldset aria-labelledby="new-route-events-label">
          <legend className="sr-only">Événements à envoyer sur cette route</legend>
          <div className="flex flex-wrap gap-3">
            {EVENTS.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={draft.events.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="h-4 w-4 rounded"
                  aria-label={EVENT_LABELS[ev] ?? ev}
                />
                {EVENT_LABELS[ev] ?? ev}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="space-y-1">
        <Label htmlFor="new-route-verbosity">
          Verbosité
          <span
            className="ml-1 text-xs text-muted-foreground"
            title="Compact : une ligne par événement. Détaillé : embed complet avec tous les champs."
          >
            (?)
          </span>
        </Label>
        <Select
          id="new-route-verbosity"
          value={draft.verbosity}
          onChange={(e) =>
            setDraft((prev) => ({
              ...prev,
              verbosity: e.target.value as 'compact' | 'detailed',
            }))
          }
          wrapperClassName="w-48"
          aria-label="Verbosité de la route"
        >
          <option value="compact">Compact</option>
          <option value="detailed">Détaillé</option>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={!isDraftValid(draft)}>
          Ajouter
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export interface RoutesSubsectionProps {
  readonly guildId: string;
  /** Routes additionnelles (la route simple est filtrée en amont par le shell). */
  readonly routes: readonly LogsRouteClient[];
  readonly onRoutesChange: (next: readonly LogsRouteClient[]) => void;
  readonly channels: readonly ChannelOption[];
  /** Callback de feedback `kind: 'success' | 'error'` remonté au shell pour la sticky bar. */
  readonly onFeedback?: (feedback: { kind: 'success' | 'error'; message: string }) => void;
}

export function RoutesSubsection({
  guildId,
  routes,
  onRoutesChange,
  channels,
  onFeedback,
}: RoutesSubsectionProps): ReactElement {
  const [testingRouteId, setTestingRouteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleDeleteRoute = (id: string): void => {
    onRoutesChange(routes.filter((r) => r.id !== id));
  };

  const handleUpdateRoute = (updated: LogsRouteClient): void => {
    onRoutesChange(routes.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleTestRoute = async (id: string): Promise<void> => {
    const route = routes.find((r) => r.id === id);
    if (!route) return;
    setTestingRouteId(id);
    const result = await testLogsRoute(guildId, route.channelId);
    setTestingRouteId(null);
    if (result.ok) {
      onFeedback?.({ kind: 'success', message: 'Test envoyé : va vérifier dans le salon.' });
    } else {
      onFeedback?.({ kind: 'error', message: `Échec : ${formatTestReason(result.reason)}` });
    }
  };

  const handleConfirmAdd = (draft: RouteDraft): void => {
    const newRoute: LogsRouteClient = {
      id: crypto.randomUUID(),
      label: draft.label.trim(),
      events: draft.events,
      channelId: draft.channelId,
      verbosity: draft.verbosity,
    };
    onRoutesChange([...routes, newRoute]);
    setShowAddForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Par défaut, tous les events vont dans le salon de destination ci-dessus. Les routes
          permettent d'envoyer certains types d'events (ex. messages supprimés) dans un salon
          différent (ex. <code>#moderation-logs</code>).
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
          aria-expanded={showAddForm}
          aria-controls="add-route-form"
        >
          + Nouvelle route
        </Button>
      </div>

      {routes.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/20 py-10 text-muted-foreground">
          <span className="opacity-40">
            <RouteIcon />
          </span>
          <p className="text-sm">Aucune route additionnelle configurée.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            + Créer une première route
          </Button>
        </div>
      ) : null}

      {routes.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left">
            <thead className="bg-surface-active/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Label</th>
                <th
                  className="cursor-help px-3 py-2"
                  title="Types d'événements Discord captés par cette route."
                >
                  Événements
                </th>
                <th className="px-3 py-2">Salon</th>
                <th
                  className="cursor-help px-3 py-2"
                  title="Compact = 1 ligne par event. Détaillé = embed complet."
                >
                  Verbosité
                </th>
                <th className="px-3 py-2 text-right">Actions</th>
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
                  onUpdate={handleUpdateRoute}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showAddForm ? (
        <div id="add-route-form">
          <AddRouteForm
            channels={channels}
            onAdd={handleConfirmAdd}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export type { RouteDraft as _RouteDraft };
// Re-exports utiles pour les tests
export { isDraftValid as _isDraftValid };
