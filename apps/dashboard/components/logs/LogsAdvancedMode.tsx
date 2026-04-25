'use client';

import { Button, Select } from '@varde/ui';
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

/** Alias locaux non-exportés — évitent une réécriture massive du JSX qui référence EVENT_LABELS[ev] et EVENTS.map(...). */
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

/**
 * Ligne du tableau des routes — supporte un mode édition inline.
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
  /** Copie locale mutable pendant l'édition. */
  const [draft, setDraft] = useState<RouteDraft>({
    label: route.label,
    events: [...route.events],
    channelId: route.channelId,
    verbosity: route.verbosity,
  });

  const channelName = channels.find((c) => c.id === route.channelId)?.name ?? route.channelId;

  const handleEdit = () => {
    /* Réinitialise le brouillon à partir de la valeur actuelle de la route. */
    setDraft({
      label: route.label,
      events: [...route.events],
      channelId: route.channelId,
      verbosity: route.verbosity,
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

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
      <tr className="border-b last:border-0 bg-muted/20">
        {/* Label */}
        <td className="px-3 py-2">
          <input
            type="text"
            value={draft.label}
            maxLength={64}
            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Label de la route"
          />
        </td>

        {/* Événements — checkboxes multi-sélection */}
        <td className="px-3 py-2">
          <fieldset>
            <legend className="sr-only">Événements de la route</legend>
            <div className="flex flex-col gap-1">
              {EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-xs cursor-pointer">
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

        {/* Salon */}
        <td className="px-3 py-2">
          <Select
            value={draft.channelId}
            onChange={(e) => setDraft((prev) => ({ ...prev, channelId: e.target.value }))}
            className="h-9"
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

        {/* Verbosité */}
        <td className="px-3 py-2">
          <Select
            value={draft.verbosity}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                verbosity: e.target.value as 'compact' | 'detailed',
              }))
            }
            className="h-9"
            aria-label="Verbosité de la route"
            title="Compact : une ligne par événement. Détaillé : embed complet avec tous les champs."
          >
            <option value="compact">Compact</option>
            <option value="detailed">Détaillé</option>
          </Select>
        </td>

        {/* Actions */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleValidate}
              disabled={!isDraftValid(draft)}
              aria-label="Valider les modifications"
            >
              Valider
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              aria-label="Annuler les modifications"
            >
              Annuler
            </Button>
          </div>
        </td>
      </tr>
    );
  }

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
            onClick={handleEdit}
            aria-label={`Éditer la route ${route.label}`}
          >
            Éditer
          </Button>
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

/**
 * Formulaire inline d'ajout de route — affiché sous le tableau au clic
 * sur "+ Nouvelle route". Disparaît après validation ou annulation.
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
      className="rounded-lg border border-dashed border-primary/40 bg-muted/20 p-4 space-y-4"
      aria-label="Formulaire d'ajout de route"
    >
      <p className="text-sm font-semibold">Nouvelle route</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Label */}
        <div className="space-y-1">
          <label htmlFor="new-route-label" className="block text-sm font-medium">
            Label
          </label>
          <input
            id="new-route-label"
            type="text"
            value={draft.label}
            maxLength={64}
            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="ex : Modération"
            required
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Label de la nouvelle route (64 caractères max)"
          />
        </div>

        {/* Salon */}
        <div className="space-y-1">
          <label htmlFor="new-route-channel" className="block text-sm font-medium">
            Salon
          </label>
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

      {/* Événements */}
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
              <label key={ev} className="flex items-center gap-1.5 text-sm cursor-pointer">
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

      {/* Verbosité */}
      <div className="space-y-1">
        <label htmlFor="new-route-verbosity" className="block text-sm font-medium">
          Verbosité
          <span
            className="ml-1 text-xs text-muted-foreground"
            title="Compact : une ligne par événement. Détaillé : embed complet avec tous les champs."
          >
            (?)
          </span>
        </label>
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

/**
 * Parse une liste d'entrées séparées par virgule.
 * Retourne les IDs valides et les entrées invalides séparément.
 */
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

/** Éditeur de la liste d'exclusions avec selects pour salons/rôles et validation mention pour utilisateurs. */
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
  /** Valeur brute de l'input utilisateurs (texte libre). */
  const [usersRaw, setUsersRaw] = useState<string>(exclusions.userIds.join(', '));
  /** Entrées invalides détectées au blur. */
  const [usersInvalid, setUsersInvalid] = useState<readonly string[]>([]);

  const handleUsersBlur = () => {
    const { ok, invalid } = parseUserIdList(usersRaw);
    setUsersInvalid(invalid);
    onChange({ ...exclusions, userIds: ok });
  };

  return (
    <div className="space-y-4">
      {/* Utilisateurs */}
      <div className="space-y-1">
        <label htmlFor="excl-users" className="block text-sm font-medium">
          Utilisateurs exclus
        </label>
        <input
          id="excl-users"
          type="text"
          value={usersRaw}
          onChange={(e) => {
            setUsersRaw(e.target.value);
            /* Réinitialise les erreurs dès que l'utilisateur retape. */
            setUsersInvalid([]);
          }}
          onBlur={handleUsersBlur}
          placeholder="<@123456789>, 987654321"
          className={[
            'flex h-9 w-full max-w-sm rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            usersInvalid.length > 0 ? 'border-destructive' : 'border-input',
          ].join(' ')}
          aria-label="Utilisateurs exclus — mentions Discord ou IDs numériques, séparés par des virgules"
          aria-describedby="excl-users-help excl-users-error"
        />
        {usersInvalid.length > 0 && (
          <p id="excl-users-error" className="text-xs text-destructive" role="alert">
            Format invalide : copie-colle une mention Discord (@nom) ou un ID numérique.{' '}
            <span className="font-medium">Ignorés : {usersInvalid.join(', ')}</span>
          </p>
        )}
        {exclusions.userIds.length > 0 && usersInvalid.length === 0 && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {exclusions.userIds.length} utilisateur{exclusions.userIds.length > 1 ? 's' : ''} exclu
            {exclusions.userIds.length > 1 ? 's' : ''}.
          </p>
        )}
        <p id="excl-users-help" className="text-xs text-muted-foreground">
          Pour obtenir l'ID d'un utilisateur : active le mode développeur Discord (Paramètres &gt;
          Avancé &gt; Mode développeur), puis clique droit sur l'utilisateur → Copier l'ID.
        </p>
      </div>

      {/* Rôles */}
      <div className="space-y-1">
        <label htmlFor="excl-roles" className="block text-sm font-medium">
          Rôles exclus
        </label>
        <Select
          id="excl-roles"
          multiple
          size={Math.min(roles.length + 1, 5)}
          value={[...exclusions.roleIds]}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange({ ...exclusions, roleIds: selected });
          }}
          wrapperClassName="max-w-sm"
          aria-label="Rôles exclus (sélection multiple — Ctrl/Cmd+clic pour sélectionner plusieurs)"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Ctrl+clic (ou Cmd+clic sur Mac) pour sélectionner plusieurs rôles.
        </p>
      </div>

      {/* Salons exclus */}
      <div className="space-y-1">
        <label htmlFor="excl-channels" className="block text-sm font-medium">
          Salons exclus
        </label>
        <Select
          id="excl-channels"
          multiple
          size={Math.min(channels.length + 1, 6)}
          value={[...exclusions.channelIds]}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange({ ...exclusions, channelIds: selected });
          }}
          wrapperClassName="max-w-sm"
          aria-label="Salons exclus (sélection multiple — Ctrl/Cmd+clic pour sélectionner plusieurs)"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Ctrl+clic (ou Cmd+clic sur Mac) pour sélectionner plusieurs salons.
        </p>
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
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer select-none text-sm font-semibold text-muted-foreground">
        ⓘ Limites techniques du module
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          Contenu &gt; 1024 caractères → pièce jointe <code>.txt</code>.
        </li>
        <li>100 events bufferisés max par route cassée (bouton Rejouer pour vider).</li>
        <li>Rate-limit Discord appliqué automatiquement (50 msg/s/bot).</li>
      </ul>
    </details>
  );
}

/** Compte le nombre de filtres actifs dans les exclusions pour l'affichage du récapitulatif. */
function activeFilterCount(ex: {
  readonly userIds: readonly string[];
  readonly roleIds: readonly string[];
  readonly channelIds: readonly string[];
  readonly excludeBots: boolean;
}): number {
  let n = 0;
  if (ex.userIds.length > 0) n += 1;
  if (ex.roleIds.length > 0) n += 1;
  if (ex.channelIds.length > 0) n += 1;
  if (ex.excludeBots) n += 1;
  return n;
}

/**
 * Mode avancé : tableau des routes + exclusions + encart limites.
 * Permet d'ajouter une route via un formulaire inline et d'éditer
 * chaque ligne individuellement.
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
  /** Contrôle la visibilité du formulaire d'ajout inline. */
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

  const handleAddRoute = () => {
    setShowAddForm(true);
  };

  /** Reçoit le brouillon validé depuis AddRouteForm et l'ajoute aux routes. */
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

  const handleCancelAdd = () => {
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
          <div>
            <h3 className="text-base font-semibold">Routes de destination</h3>
            <p className="text-sm text-muted-foreground">
              Dispatche différents events vers différents salons. Utile pour séparer modération et
              activité.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleAddRoute}
            disabled={showAddForm}
            aria-expanded={showAddForm}
            aria-controls="add-route-form"
          >
            + Nouvelle route
          </Button>
        </div>

        {routes.length === 0 && !showAddForm ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aucune route configurée.
          </p>
        ) : (
          routes.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Label</th>
                    <th
                      className="px-3 py-2 cursor-help"
                      title="Types d'événements Discord captés par cette route. Cliquer sur Éditer pour modifier."
                    >
                      Événements
                    </th>
                    <th className="px-3 py-2">Salon</th>
                    <th
                      className="px-3 py-2 cursor-help"
                      title="Compact = 1 champ par événement (moins visuel, idéal pour archivage). Détaillé = tous les champs disponibles (auteur, avant/après, timestamps)."
                    >
                      Verbosité
                    </th>
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
                      onUpdate={handleUpdateRoute}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Formulaire d'ajout inline */}
        {showAddForm && (
          <div id="add-route-form">
            <AddRouteForm channels={channels} onAdd={handleConfirmAdd} onCancel={handleCancelAdd} />
          </div>
        )}
      </div>

      {/* Filtres globaux */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Filtres globaux</h3>
          <p className="text-sm text-muted-foreground">
            S'appliquent à toutes les routes. Un event lié à un utilisateur, rôle ou salon filtré
            sera ignoré.
          </p>
        </div>
        <ExclusionsEditor
          exclusions={config.exclusions}
          roles={roles}
          channels={channels}
          onChange={handleExclusionsChange}
        />
      </div>

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
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer la configuration'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {routes.length} route{routes.length > 1 ? 's' : ''} ·{' '}
          {activeFilterCount(config.exclusions)} filtre
          {activeFilterCount(config.exclusions) > 1 ? 's' : ''} actif
          {activeFilterCount(config.exclusions) > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
