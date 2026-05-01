import { Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import type { GuildOverviewDto } from '../../lib/api-client';

/**
 * Carte « Activité du bot (24h) » (jalon 7 PR 7.4.6) : compteurs par
 * catégorie d'événement audit sur les dernières 24 h, plus un total.
 * Source : `recentActivity.byCategory` de l'API overview (cache 60 s).
 *
 * Catégories non triées par valeur : on garde l'ordre de retour API,
 * qui suit l'ordre d'insertion en JS — à peu près l'ordre
 * d'occurrence. Si une catégorie domine en volume elle peut écraser
 * visuellement les autres ; tolérable pour V1, on pourra trier par
 * activité métier (modération > joins > config) plus tard.
 *
 * Vide → message neutre + lien vers les logs (l'absence d'activité
 * peut être normale sur un petit serveur, pas une erreur).
 */

export interface RecentActivityCardProps {
  readonly guildId: string;
  readonly activity: GuildOverviewDto['recentActivity'];
}

const numberFormat = new Intl.NumberFormat('fr-FR');

export function RecentActivityCard({ guildId, activity }: RecentActivityCardProps): ReactElement {
  const t = useTranslations('overview.recentActivity');
  const entries = Object.entries(activity.byCategory);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-sm">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="space-y-2">
            {entries.map(([category, count]) => (
              <li key={category} className="flex items-center justify-between text-sm">
                <span className="capitalize text-foreground">{category}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {numberFormat.format(count)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
          {t('totalLast24h', { count: numberFormat.format(activity.totalLast24h) })}
        </p>
        <Link
          href={`/guilds/${guildId}/audit`}
          className="block text-xs font-medium text-primary hover:underline"
        >
          {t('seeAuditLog')} →
        </Link>
      </CardContent>
    </Card>
  );
}
