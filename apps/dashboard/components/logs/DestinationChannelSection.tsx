'use client';

import { Card, CardContent, CardHeader, CardTitle, Label, Select } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import { createLogsChannel } from '../../lib/logs-actions';
import type { ChannelOption } from './LogsConfigEditor';

/**
 * Card « Salon de destination ». Sélection unique du salon, lien
 * « + Créer un salon #logs » (utilise `createLogsChannel`), état vide
 * explicite si rien n'est sélectionné. Affiche un badge info quand au
 * moins une route additionnelle est configurée — pour rappeler à
 * l'admin que des events partent ailleurs que dans ce salon.
 */

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

export interface DestinationChannelSectionProps {
  readonly guildId: string;
  readonly channelId: string;
  readonly onChannelChange: (next: string) => void;
  readonly channels: readonly ChannelOption[];
  /** Nombre d'events détournés par les routes additionnelles. */
  readonly redirectedEventsCount: number;
  readonly pending?: boolean;
  readonly onFeedback?: (feedback: { kind: 'success' | 'error'; message: string }) => void;
}

export function DestinationChannelSection({
  guildId,
  channelId,
  onChannelChange,
  channels,
  redirectedEventsCount,
  pending = false,
  onFeedback,
}: DestinationChannelSectionProps): ReactElement {
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateChannel = async (): Promise<void> => {
    setIsCreating(true);
    const result = await createLogsChannel(guildId);
    setIsCreating(false);
    if (result.ok) {
      onChannelChange(result.channelId);
      onFeedback?.({
        kind: 'success',
        message: `Salon #${result.channelName} créé — pense à enregistrer.`,
      });
    } else {
      onFeedback?.({
        kind: 'error',
        message: `Impossible de créer le salon : ${formatCreateReason(result.reason)}`,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Salon de destination</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="logs-destination-channel" className="sr-only">
            Salon de destination
          </Label>
          <Select
            id="logs-destination-channel"
            value={channelId}
            onChange={(e) => onChannelChange(e.target.value)}
            disabled={pending || isCreating}
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
            disabled={isCreating || pending}
            className="rounded text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? 'Création…' : '+ Créer un salon #logs'}
          </button>
        </div>

        {channelId === '' ? (
          <p className="rounded-md border border-dashed border-warning/40 bg-warning/5 px-3 py-2 text-xs text-foreground">
            Aucun salon configuré — les logs ne sont pas envoyés.
          </p>
        ) : redirectedEventsCount > 0 ? (
          <p className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-foreground">
            {redirectedEventsCount} event{redirectedEventsCount > 1 ? 's' : ''} redirigé
            {redirectedEventsCount > 1 ? 's' : ''} via les routes (cf. configuration avancée).
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
