import { Separator } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../auth';
import { AuditView } from '../../../../components/audit/AuditView';
import { PageBreadcrumb } from '../../../../components/shell/PageBreadcrumb';
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
  return filters;
};

/**
 * Page audit log d'une guild. Lecture initiale server-side ; les
 * filtres et le scroll infini sont pilotés côté client par
 * `AuditView` via la server action `loadAuditPage`. La query string
 * peut pré-remplir les filtres (utile depuis un lien partagé) mais
 * n'est plus modifiée à chaque submit — tout reste en RAM côté client
 * pour permettre le scroll infini sans rechargement.
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
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb
          items={[{ label: 'Gestion', href: `/guilds/${guildId}` }, { label: 'Audit' }]}
        />
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="2"
                width="10"
                height="12"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="M5.5 6h5M5.5 8.5h5M5.5 11h3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <rect x="6" y="1" width="4" height="2" rx="0.5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
            Journal d'audit
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Historique des actions sur le serveur. Filtrez par type, acteur, sévérité ou fenêtre
          temporelle.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <AuditView
          guildId={guildId}
          initialItems={page.items}
          initialNextCursor={page.nextCursor}
          initialFilters={filters}
          knownActions={knownActions}
        />
      </div>
    </>
  );
}
