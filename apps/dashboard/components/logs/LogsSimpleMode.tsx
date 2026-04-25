'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Select } from '@varde/ui';
import { useMemo, useState } from 'react';

import { createLogsChannel, saveLogsConfig, testLogsRoute } from '../../lib/logs-actions';
import { EVENT_GROUPS, type LogEventGroup } from './event-catalog';
import type { ChannelOption, LogsConfigClient, LogsRouteClient } from './LogsConfigEditor';

/**
 * UUID v4 réservé à la route unique produite par le mode simple.
 * Permet au mode simple et au mode avancé de se partager la même
 * config sans conflit : save simple upsert cet id, save avancé gère
 * ses propres routes.
 */
const SIMPLE_ROUTE_ID = '00000000-0000-4000-8000-000000000001';

const GROUP_ICONS: Readonly<Record<LogEventGroup['id'], string>> = {
  members: '👤',
  messages: '💬',
  channels: '#',
  roles: '🏷️',
};

/** Sous-ensemble de reason qu'on traduit en français pour l'utilisateur. */
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

function formatCreateReason(reason: string): string {
  switch (reason) {
    case 'permission-denied':
      return 'permissions Discord manquantes pour créer un salon.';
    case 'quota-exceeded':
      return 'quota de salons atteint.';
    case 'discord-unavailable':
      return 'Discord indisponible, réessaie plus tard.';
    default:
      return 'erreur inattendue.';
  }
}

export interface LogsSimpleModeProps {
  readonly guildId: string;
  readonly config: LogsConfigClient;
  readonly setConfig: (c: LogsConfigClient) => void;
  readonly channels: readonly ChannelOption[];
}

/**
 * Mode simple : sélection du salon, grille 2×2 des familles d'events,
 * options globales, footer d'actions. Mise en page en cards façon
 * Discord settings, sans titres redondants — l'éditeur tient en une
 * seule colonne du layout 2/3 ↔ 1/3 de la page.
 */
export function LogsSimpleMode({ guildId, config, setConfig, channels }: LogsSimpleModeProps) {
  const existingSimpleRoute = useMemo(
    () => config.routes.find((r) => r.id === SIMPLE_ROUTE_ID) ?? null,
    [config.routes],
  );

  const [channelId, setChannelId] = useState<string>(existingSimpleRoute?.channelId ?? '');
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    () => new Set(existingSimpleRoute?.events ?? []),
  );
  const [excludeBots, setExcludeBots] = useState<boolean>(config.exclusions.excludeBots);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  const canSave = channelId !== '' && selectedEventIds.size > 0;

  const toggleEvent = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const toggleGroup = (groupEventIds: readonly string[]) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      const allChecked = groupEventIds.every((id) => next.has(id));
      if (allChecked) {
        for (const id of groupEventIds) next.delete(id);
      } else {
        for (const id of groupEventIds) next.add(id);
      }
      return next;
    });
  };

  /**
   * Calcule la config à envoyer à l'API, en upsertant la route
   * SIMPLE_ROUTE_ID dans `config.routes` (préserve les autres routes).
   */
  const buildConfigForSave = (): LogsConfigClient => {
    const simpleRoute: LogsRouteClient = {
      id: SIMPLE_ROUTE_ID,
      label: 'Logs',
      events: Array.from(selectedEventIds),
      channelId,
      verbosity: 'detailed',
    };
    const others = config.routes.filter((r) => r.id !== SIMPLE_ROUTE_ID);
    return {
      ...config,
      routes: [...others, simpleRoute],
      exclusions: { ...config.exclusions, excludeBots },
    };
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setFeedback(null);
    const toSave = buildConfigForSave();
    const result = await saveLogsConfig(guildId, toSave);
    setIsSaving(false);
    if (!result.ok) {
      setFeedback({
        kind: 'error',
        message: result.issues[0]?.message ?? 'Erreur inconnue',
      });
      return;
    }
    setConfig(toSave);
    setFeedback({ kind: 'success', message: 'Configuration enregistrée.' });
  };

  const handleTest = async () => {
    if (!channelId) return;
    setIsTesting(true);
    setFeedback(null);
    const result = await testLogsRoute(guildId, channelId);
    setIsTesting(false);
    if (result.ok) {
      setFeedback({ kind: 'success', message: 'Test envoyé : va vérifier dans le salon.' });
    } else {
      setFeedback({ kind: 'error', message: `Échec : ${formatTestReason(result.reason)}` });
    }
  };

  const handleCreateChannel = async () => {
    setIsCreating(true);
    setFeedback(null);
    const result = await createLogsChannel(guildId);
    setIsCreating(false);
    if (result.ok) {
      setChannelId(result.channelId);
      setFeedback({
        kind: 'success',
        message: `Salon #${result.channelName} créé — pense à enregistrer.`,
      });
    } else {
      setFeedback({
        kind: 'error',
        message: `Impossible de créer le salon : ${formatCreateReason(result.reason)}`,
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Salon de destination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="simple-channel" className="sr-only">
            Salon de destination
          </Label>
          <Select
            id="simple-channel"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            aria-label="Salon de destination"
          >
            <option value="">— Sélectionne un salon —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => void handleCreateChannel()}
            disabled={isCreating}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Création…' : '+ Créer un salon #logs'}
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Événements à surveiller</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {EVENT_GROUPS.map((group) => {
              const groupEventIds = group.events.map((e) => e.id);
              const allChecked = groupEventIds.every((id) => selectedEventIds.has(id));
              return (
                <div key={group.id} data-testid="event-group" className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span aria-hidden="true">{GROUP_ICONS[group.id]}</span>
                      <span>{group.label}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupEventIds)}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label={`${allChecked ? 'Tout décocher' : 'Tout cocher'} le groupe ${group.label}`}
                    >
                      {allChecked ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {group.events.map((event) => (
                      <label
                        key={event.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEventIds.has(event.id)}
                          onChange={() => toggleEvent(event.id)}
                          aria-label={event.label}
                          className="h-4 w-4 rounded border border-input"
                        />
                        <span>{event.label}</span>
                        {event.hint === 'bruyant' ? <Badge variant="warning">bruyant</Badge> : null}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={excludeBots}
              onChange={(e) => setExcludeBots(e.target.checked)}
              className="h-4 w-4 rounded border border-input"
            />
            <span>Ignorer les messages de bots</span>
            <Badge variant="active">recommandé</Badge>
          </label>
        </CardContent>
      </Card>

      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={
            feedback.kind === 'error'
              ? 'text-sm text-destructive'
              : 'text-sm text-emerald-600 dark:text-emerald-400'
          }
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={isTesting || !channelId}
          onClick={() => void handleTest()}
        >
          {isTesting ? 'Test…' : "Tester l'envoi"}
        </Button>
        <Button type="button" disabled={!canSave || isSaving} onClick={() => void handleSubmit()}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
