import { Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../../lib/api-client';
import { moduleIcon } from '../shell/module-icons';

/**
 * Carte « Modules épinglés » de la vue d'ensemble (jalon 7 PR 7.4.6).
 * Si l'utilisateur a au moins une épingle, on affiche la liste sous
 * forme de raccourcis cliquables vers la page de config du module.
 * Sinon : empty state avec CTA vers la liste complète des modules.
 *
 * Le toggle on/off inline n'est pas livré dans cette PR — la grille
 * de modules (PR 7.4.7) sera la surface principale de gestion
 * d'activation. Ici on reste sur de la navigation pure pour ne pas
 * dupliquer l'effort.
 */

export interface PinnedShortcutsCardProps {
  readonly guildId: string;
  /** Modules épinglés, déjà ordonnés par position. */
  readonly pinned: readonly ModuleListItemDto[];
}

export function PinnedShortcutsCard({ guildId, pinned }: PinnedShortcutsCardProps): ReactElement {
  const t = useTranslations('overview.pinned');

  if (pinned.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('emptyDescription')}</p>
          <Link
            href={`/guilds/${guildId}`}
            className="inline-flex text-sm font-medium text-primary hover:underline"
          >
            {t('emptyCta')} →
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="-mt-2">
        <ul className="flex flex-col">
          {pinned.map((m) => (
            <li key={m.id}>
              <Link
                href={`/guilds/${guildId}/modules/${m.id}`}
                className={`group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover ${
                  m.enabled ? '' : 'opacity-60'
                }`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-bg-surface-2 text-fg-secondary group-hover:text-foreground">
                  {moduleIcon(m.id, 14)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {m.name}
                  </span>
                  {m.shortDescription ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.shortDescription}
                    </span>
                  ) : null}
                </span>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
