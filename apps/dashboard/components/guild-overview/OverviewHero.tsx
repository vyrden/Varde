import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import type { GuildOverviewDto } from '../../lib/api-client';
import { formatRelativeDate } from '../../lib/format-relative-date';

/**
 * Bandeau d'en-tête de la vue d'ensemble (jalon 7 PR 7.4.6) :
 * icône serveur + nom + nombre de membres + indicateur statut bot
 * (latence + dernier event). Pas un panneau de stats — c'est juste
 * l'identité du serveur consultée et un signal vital « le bot
 * répond ».
 *
 * Quand le snapshot Discord n'est pas disponible (`memberCount: null`),
 * le badge membres est masqué — pas de mention pour ne pas afficher
 * un placeholder qui ressemble à zéro.
 */

export interface OverviewHeroProps {
  readonly guild: GuildOverviewDto['guild'];
  readonly bot: GuildOverviewDto['bot'];
}

const numberFormat = new Intl.NumberFormat('fr-FR');

export function OverviewHero({ guild, bot }: OverviewHeroProps): ReactElement {
  const t = useTranslations('overview.hero');
  const guildName = guild.name ?? '—';
  return (
    <header className="flex flex-col gap-4 border-b border-border bg-surface px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guild.iconUrl}
            alt=""
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-bg-surface-2 text-xl font-bold text-fg-secondary">
            {guildName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1
            className="truncate text-2xl font-bold leading-tight tracking-tight text-foreground"
            title={guildName}
          >
            {guildName}
          </h1>
          {guild.memberCount !== null ? (
            <p className="text-sm text-muted-foreground">
              {t('memberCount', { count: numberFormat.format(guild.memberCount) })}
            </p>
          ) : null}
        </div>
      </div>
      <BotStatusBadge bot={bot} />
    </header>
  );
}

interface BotStatusBadgeProps {
  readonly bot: GuildOverviewDto['bot'];
}

function BotStatusBadge({ bot }: BotStatusBadgeProps): ReactElement {
  const t = useTranslations('overview.hero');
  const dotColor = bot.connected ? 'bg-success' : 'bg-muted-foreground/40';
  const latencyText =
    bot.latencyMs === null ? t('latencyUnknown') : t('latency', { ms: bot.latencyMs });
  const lastEventText =
    bot.lastEventAt === null
      ? t('lastEventUnknown')
      : t('lastEvent', { when: formatRelativeDate(bot.lastEventAt).primary });

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-border bg-bg-surface-2 px-3 py-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${dotColor} ${
          bot.connected ? 'shadow-[0_0_0_3px_rgba(35,165,90,0.18)]' : ''
        }`}
      />
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">
          {bot.connected ? t('connected') : t('disconnected')}
        </span>{' '}
        · {latencyText} · {lastEventText}
      </span>
    </div>
  );
}
