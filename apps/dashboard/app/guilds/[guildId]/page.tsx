import { Badge, Card, CardContent, CardHeader, CardTitle, Separator } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import { ModuleList } from '../../../components/ModuleList';
import { PageBreadcrumb } from '../../../components/shell/PageBreadcrumb';
import {
  ApiError,
  type AuditLogItemDto,
  type AuditSeverity,
  fetchAdminGuilds,
  fetchAudit,
  fetchModules,
} from '../../../lib/api-client';
import { formatRelativeDate } from '../../../lib/format-relative-date';

interface GuildPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

const RECENT_AUDIT_LIMIT = 5;

const QUICK_LINKS: ReadonlyArray<{
  readonly icon: string;
  readonly label: string;
  readonly hrefSuffix: string;
}> = [
  { icon: '🚀', label: 'Onboarding', hrefSuffix: '/onboarding' },
  { icon: '📋', label: "Journal d'audit", hrefSuffix: '/audit' },
  { icon: '🔑', label: 'Permissions', hrefSuffix: '/settings/permissions' },
  { icon: '✦', label: 'Fournisseur IA', hrefSuffix: '/settings/ai' },
];

const SEVERITY_DOT: Record<AuditSeverity, string> = {
  info: 'bg-primary',
  warn: 'bg-warning',
  error: 'bg-destructive',
};

interface RecentActivityProps {
  readonly items: readonly AuditLogItemDto[];
  readonly guildId: string;
}

function RecentActivity({ items, guildId }: RecentActivityProps): ReactElement {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucune activité récente. Le journal se remplira au fur et à mesure que les modules agissent.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-xs">
            <span
              aria-hidden="true"
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`}
            />
            <div className="min-w-0 flex-1">
              <code className="block truncate font-mono text-[11px] text-foreground">
                {item.action}
              </code>
              <span className="text-muted-foreground">
                {formatRelativeDate(item.createdAt).primary}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Link
        href={`/guilds/${guildId}/audit`}
        className="block text-xs font-medium text-primary hover:underline"
      >
        Voir tout le journal →
      </Link>
    </div>
  );
}

/**
 * Hub modules — page d'accueil d'une guild. Header custom (breadcrumb,
 * icône, titre, description), Separator, puis layout 2 colonnes :
 *
 * - Main : grille de cards modules (ModuleList)
 * - Sidebar : « Vue d'ensemble » (modules actifs / total + nom de
 *   serveur), « Activité récente » (5 dernières lignes audit), et
 *   « Accès rapides » (raccourcis vers Onboarding / Audit /
 *   Permissions / IA).
 *
 * Les fetches audit/modules/guilds sont parallélisés. Les erreurs
 * audit sont swallowed silencieusement (la page reste utilisable
 * sans la sidebar activité).
 */
export default async function GuildPage({ params }: GuildPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  try {
    [guilds, modules] = await Promise.all([fetchAdminGuilds(), fetchModules(guildId)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  // Audit récent : best-effort, ne bloque pas la page.
  let recentAudit: readonly AuditLogItemDto[] = [];
  try {
    const page = await fetchAudit(guildId, { limit: RECENT_AUDIT_LIMIT });
    recentAudit = page.items.slice(0, RECENT_AUDIT_LIMIT);
  } catch {
    recentAudit = [];
  }

  const activeCount = modules.filter((m) => m.enabled).length;

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb items={[{ label: 'Gestion' }, { label: 'Modules' }]} />
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
            Modules
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Gérez et configurez les modules actifs sur votre serveur.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ModuleList guildId={guildId} modules={modules} />
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-6 flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Vue d'ensemble</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
                      Serveur
                    </p>
                    <p className="truncate font-medium text-foreground" title={guild.name}>
                      {guild.name}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Modules actifs</span>
                      <span className="font-mono text-foreground">
                        {activeCount} / {modules.length}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-active">
                      <div
                        aria-hidden="true"
                        className="h-full bg-primary transition-all duration-150 ease-out"
                        style={{
                          width: `${modules.length === 0 ? 0 : Math.round((activeCount / modules.length) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  {activeCount < modules.length ? (
                    <Badge variant="warning" className="text-[9px]">
                      {modules.length - activeCount} module
                      {modules.length - activeCount > 1 ? 's' : ''} inactif
                      {modules.length - activeCount > 1 ? 's' : ''}
                    </Badge>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Activité récente</CardTitle>
                </CardHeader>
                <CardContent>
                  <RecentActivity items={recentAudit} guildId={guildId} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Accès rapides</CardTitle>
                </CardHeader>
                <CardContent className="-mt-2">
                  <ul className="flex flex-col">
                    {QUICK_LINKS.map((link) => (
                      <li key={link.hrefSuffix}>
                        <Link
                          href={`/guilds/${guildId}${link.hrefSuffix}`}
                          className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                        >
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true">{link.icon}</span>
                            {link.label}
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
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
