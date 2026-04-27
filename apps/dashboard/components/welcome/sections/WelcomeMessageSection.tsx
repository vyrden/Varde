'use client';

import { Card, CardContent, CardHeader, CardTitle, Toggle } from '@varde/ui';
import type { ReactElement } from 'react';

import { MessageBlockEditor } from '../MessageBlockEditor';
import type { ChannelOption, WelcomeBlock } from '../types';

export interface WelcomeMessageSectionProps {
  readonly guildId: string;
  readonly block: WelcomeBlock;
  readonly onChange: (next: WelcomeBlock) => void;
  readonly channels: readonly ChannelOption[];
  readonly availableFonts: readonly string[];
  readonly pending?: boolean;
}

/**
 * Card « Message d'accueil » : toggle activé en header, contenu
 * (destination, salon, message, embed, carte) seulement si activé.
 * Wrappe `MessageBlockEditor` existant sans toucher à sa logique.
 */
export function WelcomeMessageSection({
  guildId,
  block,
  onChange,
  channels,
  availableFonts,
  pending = false,
}: WelcomeMessageSectionProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              Message d'accueil{' '}
              <span aria-hidden="true" className="text-base">
                👋
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Posté quand un membre rejoint le serveur. Salon, DM ou les deux au choix.
            </p>
          </div>
          <Toggle
            checked={block.enabled}
            onCheckedChange={(enabled) => onChange({ ...block, enabled })}
            disabled={pending}
            label={
              block.enabled ? "Désactiver le message d'accueil" : "Activer le message d'accueil"
            }
          />
        </div>
      </CardHeader>
      {block.enabled ? (
        <CardContent>
          <MessageBlockEditor
            idScope="welcome"
            block={block}
            onChange={onChange}
            channels={channels}
            variant="welcome"
            guildId={guildId}
            availableFonts={availableFonts}
          />
        </CardContent>
      ) : null}
    </Card>
  );
}
