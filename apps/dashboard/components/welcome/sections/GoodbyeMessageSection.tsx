'use client';

import { Card, CardContent, CardHeader, CardTitle, Toggle } from '@varde/ui';
import type { ReactElement } from 'react';

import { MessageBlockEditor } from '../MessageBlockEditor';
import type { ChannelOption, GoodbyeBlock } from '../types';

export interface GoodbyeMessageSectionProps {
  readonly guildId: string;
  readonly block: GoodbyeBlock;
  readonly onChange: (next: GoodbyeBlock) => void;
  readonly channels: readonly ChannelOption[];
  readonly availableFonts: readonly string[];
  readonly pending?: boolean;
}

/**
 * Card « Message de départ » : toggle activé en header, contenu
 * (salon, message, embed, carte) seulement si activé. Contrairement
 * à l'accueil, le départ est channel-only — pas de DM possible (le
 * membre n'est plus dans la guild).
 */
export function GoodbyeMessageSection({
  guildId,
  block,
  onChange,
  channels,
  availableFonts,
  pending = false,
}: GoodbyeMessageSectionProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              Message de départ{' '}
              <span aria-hidden="true" className="text-base">
                🚪
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Posté quand un membre quitte le serveur. Salon uniquement (pas de DM possible).
            </p>
          </div>
          <Toggle
            checked={block.enabled}
            onCheckedChange={(enabled) => onChange({ ...block, enabled })}
            disabled={pending}
            label={
              block.enabled ? 'Désactiver le message de départ' : 'Activer le message de départ'
            }
          />
        </div>
      </CardHeader>
      {block.enabled ? (
        <CardContent>
          <MessageBlockEditor
            idScope="goodbye"
            block={block}
            onChange={onChange}
            channels={channels}
            variant="goodbye"
            guildId={guildId}
            availableFonts={availableFonts}
          />
        </CardContent>
      ) : null}
    </Card>
  );
}
