import { PageTitle } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { FocusScroller } from '../../../../../components/settings/FocusScroller';
import {
  type ModulePermissionsData,
  PermissionsEditor,
} from '../../../../../components/settings/PermissionsEditor';
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
 * Page de gestion des bindings permission → rôle (PR 4.1d).
 *
 * Server component qui charge en parallèle la liste des guilds
 * administrables, les modules chargés (avec leurs permissions
 * déclarées), les bindings existants et les rôles Discord. Le rendu
 * interactif (bind / unbind) est délégué au composant client
 * `PermissionsEditor`.
 *
 * Le query param `?focus=<moduleId>` (produit par `UnboundPermissionsBanner`)
 * est transmis au composant via un `data-focus` et un fragment anchor
 * qui scrolle automatiquement vers la section du module concerné.
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

  // Construit l'index permissionId → roleIds liés pour initialiser l'éditeur.
  const bindingsByPermission = new Map<string, string[]>();
  for (const b of bindings) {
    const list = bindingsByPermission.get(b.permissionId) ?? [];
    list.push(b.roleId);
    bindingsByPermission.set(b.permissionId, list);
  }

  // Filtre les modules qui déclarent au moins une permission (les autres
  // n'ont rien à afficher dans cette page).
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
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Fil d'Ariane */}
        <nav aria-label="Fil d'Ariane">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <li>
              <Link
                href="/"
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                Mes serveurs
              </Link>
            </li>
            <li aria-hidden>{'/'}</li>
            <li>
              <Link
                href={`/guilds/${guildId}`}
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                {guild.name}
              </Link>
            </li>
            <li aria-hidden>{'/'}</li>
            <li>Paramètres</li>
            <li aria-hidden>{'/'}</li>
            <li aria-current="page" className="text-foreground font-medium">
              Permissions
            </li>
          </ol>
        </nav>

        <PageTitle
          title="Permissions des modules"
          description="Liez les permissions déclarées par chaque module à des rôles Discord. Une permission sans rôle bloque toutes les actions correspondantes."
        />

        {/* Scroll vers le module ciblé par ?focus= au montage */}
        {focus !== undefined && focus.length > 0 ? <FocusScroller targetId={focus} /> : null}

        <PermissionsEditor guildId={guildId} modules={modulesData} roles={roles} />
      </div>
    </>
  );
}
