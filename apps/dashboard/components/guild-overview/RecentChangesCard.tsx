import { Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import type { GuildOverviewDto, ModuleListItemDto } from '../../lib/api-client';
import { formatRelativeDate } from '../../lib/format-relative-date';
import { moduleIcon } from '../shell/module-icons';

/**
 * Carte « Modifié récemment » (jalon 7 PR 7.4.6) : top 3 des modules
 * dont la config a changé sur les 30 derniers jours, du plus récent
 * au plus ancien. Source : `recentChanges` de l'API overview, filtré
 * sur `core.config.updated` avec scope `modules.<id>`.
 *
 * Affichage : icône + nom + « modifié il y a {durée} » + actor ID
 * brut (le mapping userId → username Discord est hors scope V1 ;
 * le snowflake court suffit à se rappeler qui).
 */

export interface RecentChangesCardProps {
  readonly guildId: string;
  readonly changes: GuildOverviewDto['recentChanges'];
  /** Index moduleId → module pour résoudre le nom et l'icône. */
  readonly modulesById: Readonly<Record<string, ModuleListItemDto>>;
}

export function RecentChangesCard({
  guildId,
  changes,
  modulesById,
}: RecentChangesCardProps): ReactElement {
  const t = useTranslations('overview.recentChanges');

  // Filtre les entrées sans moduleId (ex. scope `core`) — le bloc se
  // concentre sur les modifications de modules.
  const moduleChanges = changes.filter((c) => c.moduleId !== null);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-sm">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {moduleChanges.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="space-y-2.5">
            {moduleChanges.map((change) => {
              const moduleId = change.moduleId ?? '';
              const module = modulesById[moduleId];
              const name = module?.name ?? moduleId;
              return (
                <li key={`${moduleId}-${change.at}`}>
                  <Link
                    href={`/guilds/${guildId}/modules/${moduleId}`}
                    className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded text-fg-secondary group-hover:text-foreground">
                      {moduleIcon(moduleId, 14)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {change.modifiedBy
                          ? t('byUser', {
                              when: formatRelativeDate(change.at).primary,
                              user: change.modifiedBy,
                            })
                          : t('bySystem', { when: formatRelativeDate(change.at).primary })}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
