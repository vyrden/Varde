import { Separator } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { FocusScroller } from '../../../../../components/settings/FocusScroller';
import {
  type ModulePermissionsData,
  PermissionsEditor,
} from '../../../../../components/settings/PermissionsEditor';
import { PageBreadcrumb } from '../../../../../components/shell/PageBreadcrumb';
import {
  ApiError,
  fetchAdminGuilds,
  fetchGuildRoles,
  fetchModules,
  fetchPermissionBindings,
} from '../../../../../lib/api-client';

interface PermissionsPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
  readonly searchParams: Promise<{ readonly focus?: string }>;
}

/**
 * Page de gestion des bindings permission → rôle. Header custom
 * (breadcrumb « Paramètres → Permissions », icône clé blurple, titre,
 * description) + Separator, puis l'éditeur 2 colonnes (liste des
 * modules à gauche avec recherche/filtres, sidebar à droite avec
 * résumé / légende / à propos).
 *
 * Le query param `?focus=<moduleId>` (produit par
 * `UnboundPermissionsBanner`) est transmis via `data-focus` et un
 * fragment anchor qui scrolle automatiquement vers la section du
 * module concerné.
 */
export default async function PermissionsPage({
  params,
  searchParams,
}: PermissionsPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const { focus } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  let bindings: Awaited<ReturnType<typeof fetchPermissionBindings>>;
  let roles: Awaited<ReturnType<typeof fetchGuildRoles>>;

  try {
    [guilds, modules, bindings, roles] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchPermissionBindings(guildId),
      fetchGuildRoles(guildId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  const bindingsByPermission = new Map<string, string[]>();
  for (const b of bindings) {
    const list = bindingsByPermission.get(b.permissionId) ?? [];
    list.push(b.roleId);
    bindingsByPermission.set(b.permissionId, list);
  }

  const modulesData: readonly ModulePermissionsData[] = modules
    .filter((m) => m.permissions.length > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      permissions: m.permissions.map((p) => ({
        definition: p,
        boundRoleIds: bindingsByPermission.get(p.id) ?? [],
      })),
    }));

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb
          items={[
            { label: 'Paramètres', href: `/guilds/${guildId}/settings` },
            { label: 'Permissions' },
          ]}
        />
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="6" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
              <path
                d="M8.3 8L13.5 2.8M11.5 4.8L13 6.3M10 6.3L11.5 7.8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">
            Permissions des modules
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Liez les permissions de chaque module à des rôles Discord. Une permission sans rôle bloque
          toutes les actions correspondantes.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        {focus !== undefined && focus.length > 0 ? <FocusScroller targetId={focus} /> : null}
        <PermissionsEditor guildId={guildId} modules={modulesData} roles={roles} />
      </div>
    </>
  );
}
