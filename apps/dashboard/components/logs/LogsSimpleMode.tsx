'use client';

import { Button } from '@varde/ui';
import { useState } from 'react';

import type { CreateLogsChannelError, TestLogsRouteError } from '../../lib/logs-actions';
import { createLogsChannel, saveLogsConfig, testLogsRoute } from '../../lib/logs-actions';
import type { ChannelOption, LogsConfigClient, LogsRouteClient } from './LogsConfigEditor';

/** Traduit un code d'erreur de la création de salon en phrase française. */
function formatCreateReason(reason: CreateLogsChannelError['reason']): string {
  switch (reason) {
    case 'permission-denied':
      return 'Permissions insuffisantes — le bot doit avoir Gérer les salons.';
    case 'quota-exceeded':
      return 'Nombre maximal de salons atteint sur cette guild.';
    case 'discord-unavailable':
      return "Le bot Discord n'est pas connecté, réessaie dans un instant.";
    case 'unknown':
      return 'Erreur inattendue, consulte les logs du serveur.';
  }
}

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

/**
 * Identifiant stable de la route générée en mode simple. UUID v4
 * déterministe (zéros + nybble `4` + variant `8`) pour passer
 * `z.string().uuid()` côté module tout en restant identifiable d'un
 * rendu à l'autre.
 */
const SIMPLE_ROUTE_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Événements pilotes disponibles en V1. Les identifiants sont ceux du
 * catalogue `CoreEvent` (préfixe `guild.`), cohérents avec la registry
 * de formatters côté module logs.
 */
const ALL_EVENTS = [
  'guild.messageDelete',
  'guild.messageEdit',
  'guild.memberJoin',
  'guild.memberLeave',
] as const;
const MODERATION_EVENTS = [
  'guild.messageDelete',
  'guild.messageEdit',
  'guild.memberLeave',
] as const;
const MEMBERS_EVENTS = ['guild.memberJoin', 'guild.memberLeave'] as const;

type LogPreset = 'all' | 'moderation' | 'members';

/** Dérive une route unique depuis le preset choisi et le salon sélectionné. */
function buildRouteFromPreset(preset: LogPreset, channelId: string): LogsRouteClient {
  switch (preset) {
    case 'all':
      return {
        id: SIMPLE_ROUTE_ID,
        label: 'Tout',
        events: ALL_EVENTS,
        channelId,
        verbosity: 'detailed',
      };
    case 'moderation':
      return {
        id: SIMPLE_ROUTE_ID,
        label: 'Modération',
        events: MODERATION_EVENTS,
        channelId,
        verbosity: 'detailed',
      };
    case 'members':
      return {
        id: SIMPLE_ROUTE_ID,
        label: 'Membres',
        events: MEMBERS_EVENTS,
        channelId,
        verbosity: 'compact',
      };
  }
}

export interface LogsSimpleModeProps {
  readonly guildId: string;
  readonly config: LogsConfigClient;
  readonly setConfig: (c: LogsConfigClient) => void;
  readonly channels: readonly ChannelOption[];
}

/**
 * Mode simple : 3 contrôles (salon, preset, bots) + bouton Enregistrer
 * + bouton Tester.
 *
 * Les callbacks onSubmit et onTest sont des placeholders — ils seront
 * câblés aux server actions aux Tasks 7-8.
 */
export function LogsSimpleMode({ guildId, config, setConfig, channels }: LogsSimpleModeProps) {
  /** Salon sélectionné : on lit la première route ou rien. */
  const existingRoute = config.routes.find((r) => r.id === SIMPLE_ROUTE_ID) ?? config.routes[0];
  const [channelId, setChannelId] = useState<string>(existingRoute?.channelId ?? '');
  const [preset, setPreset] = useState<LogPreset>('all');
  const [excludeBots, setExcludeBots] = useState<boolean>(config.exclusions.excludeBots);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  const canSave = channelId !== '';

  const applyToConfig = (
    nextChannelId: string,
    nextPreset: LogPreset,
    nextExcludeBots: boolean,
  ) => {
    if (!nextChannelId) return;
    const route = buildRouteFromPreset(nextPreset, nextChannelId);
    setConfig({
      ...config,
      routes: [route],
      exclusions: { ...config.exclusions, excludeBots: nextExcludeBots },
    });
  };

  const handleChannelChange = (value: string) => {
    setChannelId(value);
    applyToConfig(value, preset, excludeBots);
  };

  const handlePresetChange = (value: LogPreset) => {
    setPreset(value);
    applyToConfig(channelId, value, excludeBots);
  };

  const handleExcludeBotsChange = (value: boolean) => {
    setExcludeBots(value);
    applyToConfig(channelId, preset, value);
  };

  const handleCreateChannel = async () => {
    setIsCreating(true);
    setFeedback(null);
    const result = await createLogsChannel(guildId);
    setIsCreating(false);
    if (result.ok) {
      setChannelId(result.channelId);
      applyToConfig(result.channelId, preset, excludeBots);
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

  const handleSubmit = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setFeedback(null);
    const result = await saveLogsConfig(guildId, config);
    setIsSaving(false);
    if (!result.ok) {
      setFeedback({ kind: 'error', message: result.issues[0]?.message ?? 'Erreur inconnue' });
    } else {
      setFeedback({ kind: 'success', message: 'Configuration enregistrée.' });
    }
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Configuration des logs</h2>
        <p className="text-sm text-muted-foreground">
          Choisissez le salon de destination et ce que vous souhaitez enregistrer.
        </p>
      </div>

      {/* Salon de logs */}
      <fieldset className="space-y-2">
        <label htmlFor="logs-channel" className="block text-sm font-medium">
          Salon de logs
        </label>
        <div className="flex items-center gap-2">
          <select
            id="logs-channel"
            value={channelId}
            onChange={(e) => handleChannelChange(e.target.value)}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Salon de logs"
          >
            <option value="">— Choisir un salon —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isCreating}
            onClick={() => void handleCreateChannel()}
          >
            {isCreating ? 'Création…' : 'Créer #logs pour moi'}
          </Button>
        </div>
      </fieldset>

      {/* Que logger */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Que logger</legend>
        <div className="space-y-2" role="radiogroup" aria-label="Que logger">
          {(
            [
              { value: 'all', label: 'Tout (messages, modération, membres)' },
              {
                value: 'moderation',
                label: 'Modération seulement (suppressions, éditions, départs)',
              },
              { value: 'members', label: 'Activité des membres (arrivées, départs)' },
            ] as { value: LogPreset; label: string }[]
          ).map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="log-preset"
                value={opt.value}
                checked={preset === opt.value}
                onChange={() => handlePresetChange(opt.value)}
                className="h-4 w-4 text-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Exclure les bots */}
      <fieldset className="space-y-2">
        <legend className="sr-only">Options d'exclusion</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={excludeBots}
            onChange={(e) => handleExcludeBotsChange(e.target.checked)}
            className="h-4 w-4 rounded text-primary"
            aria-label="Exclure les bots des logs"
          />
          Exclure les bots des logs
        </label>
      </fieldset>

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

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="button" disabled={!canSave || isSaving} onClick={() => void handleSubmit()}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!canSave || isTesting}
          onClick={() => void handleTest()}
        >
          {isTesting ? 'Test en cours…' : 'Tester'}
        </Button>
      </div>
    </div>
  );
}
