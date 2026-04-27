'use client';

import { Button, Select } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import { RESTRICTED_MODE_HINT, RESTRICTED_MODE_LABEL } from './rule-meta';
import type { ChannelOption, RestrictedChannelClient, RestrictedChannelModeClient } from './types';

export interface RestrictedChannelsSectionProps {
  readonly channels: readonly ChannelOption[];
  readonly restrictedChannels: readonly RestrictedChannelClient[];
  readonly pending: boolean;
  readonly onAdd: (channelId: string) => void;
  readonly onUpdate: (channelId: string, next: RestrictedChannelClient) => void;
  readonly onRemove: (channelId: string) => void;
}

/**
 * Section « Salons restreints ». Permet de sélectionner un salon et
 * de cocher les modes acceptés (commands / images / videos). Tout
 * message qui ne satisfait AUCUN des modes est supprimé. Évalué en
 * priorité côté runtime (avant rules + bypass roles).
 *
 * Au moins un mode doit rester actif sur un salon ajouté — un click
 * qui décocherait le dernier est neutralisé visuellement.
 */
export function RestrictedChannelsSection({
  channels,
  restrictedChannels,
  pending,
  onAdd,
  onUpdate,
  onRemove,
}: RestrictedChannelsSectionProps): ReactElement {
  const [draftChannel, setDraftChannel] = useState('');
  const usedChannelIds = new Set(restrictedChannels.map((rc) => rc.channelId));
  const availableChannels = channels.filter((c) => !usedChannelIds.has(c.id));
  return (
    <div className="space-y-3">
      {restrictedChannels.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-xs text-muted-foreground">
          Aucun salon restreint configuré. Sélectionne un salon ci-dessous pour commencer.
        </p>
      ) : (
        <ul className="space-y-2">
          {restrictedChannels.map((rc) => {
            const channel = channels.find((c) => c.id === rc.channelId);
            const channelLabel = channel ? `#${channel.name}` : `<inconnu ${rc.channelId}>`;
            const toggleMode = (mode: RestrictedChannelModeClient): void => {
              const has = rc.modes.includes(mode);
              if (has && rc.modes.length === 1) return;
              const nextModes = has ? rc.modes.filter((m) => m !== mode) : [...rc.modes, mode];
              onUpdate(rc.channelId, { ...rc, modes: nextModes });
            };
            return (
              <li
                key={rc.channelId}
                className="rounded-md border border-border bg-card/60 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">{channelLabel}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(rc.channelId)}
                    disabled={pending}
                    aria-label={`Retirer ${channelLabel}`}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    ✕
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(RESTRICTED_MODE_LABEL) as RestrictedChannelModeClient[]).map(
                    (mode) => {
                      const active = rc.modes.includes(mode);
                      const isLast = active && rc.modes.length === 1;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => toggleMode(mode)}
                          disabled={pending || isLast}
                          aria-pressed={active}
                          title={RESTRICTED_MODE_HINT[mode]}
                          className={`rounded-md px-2 py-1 text-xs transition-colors ${
                            active
                              ? 'bg-primary/15 text-primary'
                              : 'bg-surface-active text-muted-foreground hover:text-foreground'
                          } ${isLast ? 'cursor-not-allowed opacity-70' : ''}`}
                        >
                          {RESTRICTED_MODE_LABEL[mode]}
                        </button>
                      );
                    },
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {availableChannels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={draftChannel}
            onChange={(e) => setDraftChannel(e.target.value)}
            wrapperClassName="w-64 shrink-0"
            disabled={pending}
            aria-label="Salon à restreindre"
          >
            <option value="">— Sélectionner un salon —</option>
            {availableChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (draftChannel.length === 0) return;
              onAdd(draftChannel);
              setDraftChannel('');
            }}
            disabled={pending || draftChannel.length === 0}
          >
            + Restreindre
          </Button>
        </div>
      ) : null}
    </div>
  );
}
