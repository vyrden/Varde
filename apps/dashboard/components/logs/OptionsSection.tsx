'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import type { ReactElement } from 'react';

export interface OptionsSectionProps {
  readonly excludeBots: boolean;
  readonly onExcludeBotsChange: (next: boolean) => void;
  readonly pending?: boolean;
}

/**
 * Card « Options ». Bloc des options simples globales — actuellement
 * juste « Ignorer les bots » (badge `recommandé`). Conçu pour
 * accueillir d'autres toggles simples plus tard sans casser la mise
 * en page.
 */
export function OptionsSection({
  excludeBots,
  onExcludeBotsChange,
  pending = false,
}: OptionsSectionProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Options</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={excludeBots}
            onChange={(e) => onExcludeBotsChange(e.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border border-input"
          />
          <span>Ignorer les messages de bots</span>
          <Badge variant="active">recommandé</Badge>
        </label>
        <p className="text-xs text-muted-foreground">
          Évite de polluer le salon de logs avec les actions des autres bots du serveur (commandes
          slash, réponses automatiques, etc.).
        </p>
      </CardContent>
    </Card>
  );
}
