import { getTranslations } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import { auth } from '../../auth';
import { AdminShell, buildAdminSidebarItems } from '../../components/admin/AdminShell';
import { fetchAdminOverview } from '../../lib/admin-api';

/**
 * Section 1 — Vue d'ensemble (`/admin`). Grille de cartes
 * matérialisant l'état de l'instance : statut bot, version,
 * serveurs, modules, base de données.
 *
 * Pas de mutation ici — purement un dashboard de lecture. Le
 * payload est récupéré via `GET /admin/overview` (déjà fourni par
 * sub-livrable 4b) en server-component.
 */

interface CardProps {
  readonly title: string;
  readonly children: ReactNode;
}

const Card = ({ title, children }: CardProps): ReactElement => (
  <div className="rounded-lg border border-border-muted bg-card p-5 shadow-sm">
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h3>
    {children}
  </div>
);

const formatUptime = (
  seconds: number,
  t: (key: string, values?: Record<string, number>) => string,
): string => {
  if (seconds < 60) return t('uptime.seconds', { value: Math.floor(seconds) });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('uptime.minutes', { value: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('uptime.hours', { value: hours });
  const days = Math.floor(hours / 24);
  return t('uptime.days', { value: days });
};

const formatBytes = (
  bytes: number | null,
  t: (key: string, values?: Record<string, number | string>) => string,
): string => {
  if (bytes === null) return t('unknown');
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
};

export default async function AdminOverviewPage(): Promise<ReactElement> {
  const overview = await fetchAdminOverview();
  const t = await getTranslations('admin.overview');
  const tShell = await getTranslations('admin.shell');
  const session = await auth();
  const userName = session?.user?.globalName ?? session?.user?.name ?? null;
  const items = await buildAdminSidebarItems();

  return (
    <AdminShell
      current="overview"
      userName={userName}
      bannerMessage={tShell('banner')}
      sidebarHeading={tShell('sidebarHeading')}
      items={items}
      backToAppLabel={tShell('backToApp')}
    >
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title={t('cards.bot.title')}>
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                overview.bot.connected
                  ? 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100'
                  : 'bg-muted text-muted-foreground'
              }`}
              data-testid="admin-bot-status"
            >
              {overview.bot.connected ? t('cards.bot.connected') : t('cards.bot.disconnected')}
            </span>
            {overview.bot.latencyMs !== null ? (
              <span className="text-sm text-muted-foreground">
                {t('cards.bot.latency', { value: overview.bot.latencyMs })}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('cards.bot.uptime')} : {formatUptime(overview.bot.uptime, t)}
          </p>
        </Card>

        <Card title={t('cards.version.title')}>
          <p className="text-2xl font-semibold text-foreground" data-testid="admin-version">
            {overview.bot.version}
          </p>
        </Card>

        <Card title={t('cards.guilds.title')}>
          <p className="text-2xl font-semibold text-foreground" data-testid="admin-guilds-count">
            {overview.guilds.count}
          </p>
          {overview.guilds.totalMembers !== null ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('cards.guilds.members', { value: overview.guilds.totalMembers })}
            </p>
          ) : null}
        </Card>

        <Card title={t('cards.modules.title')}>
          <p className="text-2xl font-semibold text-foreground" data-testid="admin-modules-active">
            {overview.modules.active}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / {overview.modules.installed}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('cards.modules.activeOverInstalled')}
          </p>
        </Card>

        <Card title={t('cards.db.title')}>
          <p className="text-sm font-medium text-foreground">
            {overview.db.driver === 'pg' ? 'PostgreSQL' : 'SQLite'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('cards.db.size')} : {formatBytes(overview.db.sizeBytes, t)}
          </p>
          {overview.db.lastMigration !== null ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('cards.db.lastMigration')} : {overview.db.lastMigration}
            </p>
          ) : null}
        </Card>
      </div>
    </AdminShell>
  );
}
