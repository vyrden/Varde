import { PageTitle } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../auth';
import { AuditFilters } from '../../../../components/AuditFilters';
import { AuditTable } from '../../../../components/AuditTable';
import { DashboardHeader } from '../../../../components/DashboardHeader';
import {
  ApiError,
  type AuditActorType,
  type AuditFilters as AuditFiltersValues,
  type AuditSeverity,
  fetchAdminGuilds,
  fetchAudit,
} from '../../../../lib/api-client';

interface AuditPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const AUDIT_ACTOR_TYPES: readonly AuditActorType[] = ['user', 'system', 'module'];
const AUDIT_SEVERITIES: readonly AuditSeverity[] = ['info', 'warn', 'error'];

const firstString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const narrowActorType = (value: string | undefined): AuditActorType | undefined => {
  if (!value) return undefined;
  return AUDIT_ACTOR_TYPES.includes(value as AuditActorType)
    ? (value as AuditActorType)
    : undefined;
};

const narrowSeverity = (value: string | undefined): AuditSeverity | undefined => {
  if (!value) return undefined;
  return AUDIT_SEVERITIES.includes(value as AuditSeverity) ? (value as AuditSeverity) : undefined;
};

const buildFilters = (
  searchParams: Record<string, string | string[] | undefined>,
): AuditFiltersValues => {
  const filters: {
    action?: string;
    actorType?: AuditActorType;
    severity?: AuditSeverity;
    since?: string;
    until?: string;
    cursor?: string;
  } = {};
  const action = firstString(searchParams['action']);
  if (action) filters.action = action;
  const actorType = narrowActorType(firstString(searchParams['actorType']));
  if (actorType) filters.actorType = actorType;
  const severity = narrowSeverity(firstString(searchParams['severity']));
  if (severity) filters.severity = severity;
  const since = firstString(searchParams['since']);
  if (since) filters.since = since;
  const until = firstString(searchParams['until']);
  if (until) filters.until = until;
  const cursor = firstString(searchParams['cursor']);
  if (cursor) filters.cursor = cursor;
  return filters;
};

const buildNextUrl = (guildId: string, filters: AuditFiltersValues, cursor: string): string => {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.actorType) params.set('actorType', filters.actorType);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.since) params.set('since', filters.since);
  if (filters.until) params.set('until', filters.until);
  params.set('cursor', cursor);
  return `/guilds/${guildId}/audit?${params.toString()}`;
};

/**
 * Page audit log d'une guild. Lecture paginée cursor-based, filtres
 * pilotés par l'URL (voir [`AuditFilters`](../../../../components/AuditFilters.tsx)).
 * On fait deux lectures parallèles : la liste des guilds admin pour
 * vérifier l'accès (et récupérer le nom de la guild pour le header),
 * et la page audit elle-même. Les filtres invalides côté URL sont
 * simplement ignorés — l'API validera à nouveau et refusera les
 * mauvaises valeurs si jamais l'une passe côté client.
 */
export default async function AuditPage({
  params,
  searchParams,
}: AuditPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const rawSearch = await searchParams;
  const session = await auth();
  if (!session?.user) redirect('/');

  const filters = buildFilters(rawSearch);

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let page: Awaited<ReturnType<typeof fetchAudit>>;
  try {
    [guilds, page] = await Promise.all([fetchAdminGuilds(), fetchAudit(guildId, filters)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  const knownActions = Array.from(new Set(page.items.map((item) => item.action))).sort();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName={session.user.name} />
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div>
          <Link
            href={`/guilds/${guildId}`}
            className="text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            ← {guild.name}
          </Link>
        </div>
        <PageTitle
          title="Journal d'audit"
          description="Historique des actions sur le serveur. Filtrez par type, sévérité ou fenêtre temporelle."
        />
        <AuditFilters guildId={guildId} values={filters} knownActions={knownActions} />
        <AuditTable items={page.items} />
        {page.nextCursor ? (
          <div className="flex justify-center">
            <Link
              href={buildNextUrl(guildId, filters, page.nextCursor)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Charger la suite
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
