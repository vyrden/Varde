'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@varde/ui';
import type { ReactElement } from 'react';

import type { ChannelOption } from '../types';

export interface GeneralInfoSectionProps {
  readonly label: string;
  readonly onLabelChange: (next: string) => void;
  readonly channelId: string;
  readonly onChannelChange: (next: string) => void;
  readonly message: string;
  readonly onMessageChange: (next: string) => void;
  readonly channels: readonly ChannelOption[];
  readonly pending?: boolean;
  /** En mode edit, le salon initial — affiche un avertissement si l'admin le change. */
  readonly originalChannelId?: string;
}

/**
 * Card « Informations générales » : label (interne), salon de
 * publication, contenu du message Discord. Helpers contextuels
 * renforcés pour clarifier quel champ est visible des membres et
 * lequel est interne au dashboard.
 */
export function GeneralInfoSection({
  label,
  onLabelChange,
  channelId,
  onChannelChange,
  message,
  onMessageChange,
  channels,
  pending = false,
  originalChannelId,
}: GeneralInfoSectionProps): ReactElement {
  const channelChanged =
    originalChannelId !== undefined &&
    originalChannelId.length > 0 &&
    originalChannelId !== channelId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Informations générales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="rr-label">Label</Label>
          <Input
            id="rr-label"
            type="text"
            value={label}
            placeholder="Ex. Couleurs de nom"
            maxLength={64}
            onChange={(e) => onLabelChange(e.target.value)}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Nom utilisé dans le dashboard pour t'y retrouver. Pas visible des membres.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rr-channel">Salon de publication</Label>
          <Select
            id="rr-channel"
            value={channelId}
            onChange={(e) => onChannelChange(e.target.value)}
            disabled={pending}
          >
            <option value="">— choisir un salon —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Le salon Discord où le message sera posté.
          </p>
          {channelChanged ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Changer de salon supprimera le message actuel et en repostera un nouveau (les
              réactions existantes des membres seront perdues).
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rr-message">Contenu du message Discord</Label>
          <Textarea
            id="rr-message"
            value={message}
            placeholder="Le texte qui apparaîtra dans le message Discord…"
            maxLength={2000}
            rows={4}
            onChange={(e) => onMessageChange(e.target.value)}
            disabled={pending}
          />
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Markdown Discord supporté : <code>**gras**</code>, <code>*italique*</code>,{' '}
              <code>__souligné__</code>, <code>~~barré~~</code>, <code>`code`</code>, listes,{' '}
              <code>&gt; citations</code>.
            </p>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {message.length}/2000
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
