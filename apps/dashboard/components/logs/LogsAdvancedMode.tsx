'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from '@varde/ui';
import { useState } from 'react';

import type { TestLogsRouteError } from '../../lib/logs-actions';
import { saveLogsConfig, testLogsRoute } from '../../lib/logs-actions';
import { ALL_EVENT_IDS, EVENT_LABEL } from './event-catalog';
import type {
  ChannelOption,
  LogsConfigClient,
  LogsExclusionsClient,
  LogsRouteClient,
  RoleOption,
} from './LogsConfigEditor';

const EVENT_LABELS = EVENT_LABEL;
const EVENTS = ALL_EVENT_IDS;

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

/** Brouillon de route pour le formulaire d'ajout. */
interface RouteDraft {
  label: string;
  events: readonly string[];
  channelId: string;
  verbosity: 'compact' | 'detailed';
}

function emptyDraft(): RouteDraft {
  return { label: '', events: [], channelId: '', verbosity: 'detailed' };
}

function isDraftValid(d: RouteDraft): boolean {
  return d.label.trim() !== '' && d.events.length > 0 && d.channelId !== '';
}

export interface LogsAdvancedModeProps {
  readonly guildId: string;
  readonly config: LogsConfigClient;
  readonly setConfig: (c: LogsConfigClient) => void;
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
}

// --- Icônes inline pour les actions de lignes ---

function PencilIcon() {
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

function PlayIcon() {
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

function TrashIcon() {
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

function CheckIcon() {
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

function CloseIcon() {
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

function RouteIcon() {
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

/**
 * Ligne du tableau des routes. Mode lecture par défaut, bascule en
 * édition inline avec un brouillon local. Les actions sont des icon
 * buttons compacts avec aria-label explicite.
 */
function RouteRow({
  route,
  channels,
  isTesting,
  onDelete,
  onTest,
  onUpdate,
}: {
  route: LogsRouteClient;
  channels: readonly ChannelOption[];
  isTesting: boolean;
  onDelete: () => void;
  onTest: () => void;
  onUpdate: (updated: LogsRouteClient) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<RouteDraft>({
    label: route.label,
    events: [...route.events],
    channelId: route.channelId,
    verbosity: route.verbosity,
  });

  const channelName = channels.find((c) => c.id === route.channelId)?.name ?? route.channelId;

  const handleEdit = () => {
    setDraft({
      label: route.label,
      events: [...route.events],
      channelId: route.channelId,
      verbosity: route.verbosity,
    });
    setIsEditing(true);
  };

  const handleCancel = () => setIsEditing(false);

  const handleValidate = () => {
    if (!isDraftValid(draft)) return;
    onUpdate({ ...route, ...draft });
    setIsEditing(false);
  };

  const toggleEvent = (ev: string) => {
    setDraft((prev) => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter((e) => e !== ev) : [...prev.events, ev],
    }));
  };

  if (isEditing) {
    return (
      <tr className="border-b border-border last:border-0 bg-surface-active/30">
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

/**
 * Formulaire d'ajout inline. Affiché en bas de la card Routes au clic
 * sur « + Nouvelle route ».
 */
function AddRouteForm({
  channels,
  onAdd,
  onCancel,
}: {
  channels: readonly ChannelOption[];
  onAdd: (draft: RouteDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<RouteDraft>(emptyDraft);

  const toggleEvent = (ev: string) => {
    setDraft((prev) => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter((e) => e !== ev) : [...prev.events, ev],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
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

/**
 * Extrait un userId depuis "<@123>", "<@!123>" ou "123" (snowflake brut).
 * Retourne null si le format est invalide.
 */
export function parseUserIdInput(raw: string): string | null {
  const mentionMatch = /^<@!?(\d{17,19})>$/.exec(raw.trim());
  if (mentionMatch) return mentionMatch[1] ?? null;
  const snowflake = /^\d{17,19}$/.exec(raw.trim());
  if (snowflake) return raw.trim();
  return null;
}

/** Parse une liste d'entrées séparées par virgule. */
export function parseUserIdList(input: string): {
  readonly ok: readonly string[];
  readonly invalid: readonly string[];
} {
  const parts = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    const id = parseUserIdInput(part);
    if (id !== null) {
      ok.push(id);
    } else {
      invalid.push(part);
    }
  }
  return { ok, invalid };
}

/** Éditeur des exclusions globales — utilisateurs, rôles, salons, bots. */
function ExclusionsEditor({
  exclusions,
  roles,
  channels,
  onChange,
}: {
  exclusions: LogsExclusionsClient;
  roles: readonly RoleOption[];
  channels: readonly ChannelOption[];
  onChange: (e: LogsExclusionsClient) => void;
}) {
  const [usersRaw, setUsersRaw] = useState<string>(exclusions.userIds.join(', '));
  const [usersInvalid, setUsersInvalid] = useState<readonly string[]>([]);

  const handleUsersBlur = () => {
    const { ok, invalid } = parseUserIdList(usersRaw);
    setUsersInvalid(invalid);
    onChange({ ...exclusions, userIds: ok });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Label htmlFor="excl-users">Utilisateurs exclus</Label>
        <Input
          id="excl-users"
          type="text"
          value={usersRaw}
          onChange={(e) => {
            setUsersRaw(e.target.value);
            setUsersInvalid([]);
          }}
          onBlur={handleUsersBlur}
          placeholder="<@123456789>, 987654321"
          className={usersInvalid.length > 0 ? 'border-destructive' : ''}
          aria-label="Utilisateurs exclus — mentions Discord ou IDs numériques, séparés par des virgules"
          aria-describedby="excl-users-help excl-users-error"
        />
        {usersInvalid.length > 0 ? (
          <p id="excl-users-error" className="text-xs text-destructive" role="alert">
            Format invalide : copie-colle une mention Discord (@nom) ou un ID numérique.{' '}
            <span className="font-medium">Ignorés : {usersInvalid.join(', ')}</span>
          </p>
        ) : null}
        {exclusions.userIds.length > 0 && usersInvalid.length === 0 ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {exclusions.userIds.length} utilisateur{exclusions.userIds.length > 1 ? 's' : ''} exclu
            {exclusions.userIds.length > 1 ? 's' : ''}.
          </p>
        ) : null}
        <p id="excl-users-help" className="text-xs text-muted-foreground">
          Mode développeur Discord puis clic droit → Copier l'ID. Mentions ou IDs séparés par
          virgules.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="excl-roles">Rôles exclus</Label>
        <Select
          id="excl-roles"
          multiple
          size={Math.min(roles.length + 1, 5)}
          value={[...exclusions.roleIds]}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange({ ...exclusions, roleIds: selected });
          }}
          aria-label="Rôles exclus (sélection multiple — Ctrl/Cmd+clic pour sélectionner plusieurs)"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Ctrl+clic (Cmd+clic sur Mac) pour sélectionner plusieurs rôles.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="excl-channels">Salons exclus</Label>
        <Select
          id="excl-channels"
          multiple
          size={Math.min(channels.length + 1, 6)}
          value={[...exclusions.channelIds]}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange({ ...exclusions, channelIds: selected });
          }}
          aria-label="Salons exclus (sélection multiple — Ctrl/Cmd+clic pour sélectionner plusieurs)"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Ctrl+clic (Cmd+clic sur Mac) pour sélectionner plusieurs salons.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
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

/** Compteur de filtres actifs pour le récap du footer. */
function activeFilterCount(ex: LogsExclusionsClient): number {
  let n = 0;
  if (ex.userIds.length > 0) n += 1;
  if (ex.roleIds.length > 0) n += 1;
  if (ex.channelIds.length > 0) n += 1;
  if (ex.excludeBots) n += 1;
  return n;
}

/**
 * Mode avancé : Card des routes (header + table + add form), Card
 * des filtres globaux, Card discrète des limites techniques, footer
 * Save + counter. Le header de page et la sidebar sont rendus par
 * le parent (page logs).
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
  const [testingRouteId, setTestingRouteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [showAddForm, setShowAddForm] = useState(false);

  const syncRoutes = (next: readonly LogsRouteClient[]) => {
    setRoutes(next);
    setConfig({ ...config, routes: next });
  };

  const handleDeleteRoute = (id: string) => {
    syncRoutes(routes.filter((r) => r.id !== id));
  };

  const handleUpdateRoute = (updated: LogsRouteClient) => {
    syncRoutes(routes.map((r) => (r.id === updated.id ? updated : r)));
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

  const handleConfirmAdd = (draft: RouteDraft) => {
    const newRoute: LogsRouteClient = {
      id: crypto.randomUUID(),
      label: draft.label.trim(),
      events: draft.events,
      channelId: draft.channelId,
      verbosity: draft.verbosity,
    };
    syncRoutes([...routes, newRoute]);
    setShowAddForm(false);
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

  const filtersActive = activeFilterCount(config.exclusions);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Routes de destination</CardTitle>
            <CardDescription>
              Dispatche différents events vers différents salons. Utile pour séparer modération et
              activité.
            </CardDescription>
          </div>
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
        </CardHeader>
        <CardContent className="space-y-4">
          {routes.length === 0 && !showAddForm ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <span className="opacity-40">
                <RouteIcon />
              </span>
              <p className="text-sm">Aucune route configurée.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(true)}
              >
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtres globaux</CardTitle>
          <CardDescription>
            S'appliquent à toutes les routes. Un event lié à un utilisateur, rôle ou salon filtré
            sera ignoré.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExclusionsEditor
            exclusions={config.exclusions}
            roles={roles}
            channels={channels}
            onChange={handleExclusionsChange}
          />
        </CardContent>
      </Card>

      <details className="rounded-md border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer select-none font-medium text-muted-foreground">
          Limites techniques du module
        </summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            Contenu &gt; 1024 caractères → pièce jointe <code>.txt</code>.
          </li>
          <li>100 events bufferisés max par route cassée (bouton Rejouer pour vider).</li>
          <li>Rate-limit Discord appliqué automatiquement (50 msg/s/bot).</li>
        </ul>
      </details>

      {feedback !== null ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={
            feedback.kind === 'success'
              ? 'text-sm text-emerald-600 dark:text-emerald-400'
              : 'text-sm text-destructive'
          }
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-muted-foreground">
          {routes.length} route{routes.length > 1 ? 's' : ''} · {filtersActive} filtre
          {filtersActive > 1 ? 's' : ''} actif{filtersActive > 1 ? 's' : ''}
        </span>
        <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer la configuration'}
        </Button>
      </div>
    </div>
  );
}
