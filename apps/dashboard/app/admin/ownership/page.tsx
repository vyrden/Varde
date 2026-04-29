import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import {
  type AdminOwnershipCopy,
  AdminOwnershipSection,
} from '../../../components/admin/AdminOwnershipSection';
import { AdminShell, buildAdminSidebarItems } from '../../../components/admin/AdminShell';
import { fetchAdminOwners } from '../../../lib/admin-api';

/**
 * Section 5 — Ownership (`/admin/ownership`). Liste des owners
 * de l'instance + ajout/suppression. Le payload initial vient de
 * `GET /admin/ownership` ; les mutations passent par les server
 * actions de `lib/admin-ownership-actions.ts` qui invalident le
 * segment via `revalidatePath('/admin/ownership')`.
 */
export default async function AdminOwnershipPage(): Promise<ReactElement> {
  const { owners } = await fetchAdminOwners();
  const t = await getTranslations('admin.ownership');
  const tShell = await getTranslations('admin.shell');
  const session = await auth();
  const userName = session?.user?.globalName ?? session?.user?.name ?? null;
  const currentUserDiscordId = session?.user?.id ?? null;
  const items = await buildAdminSidebarItems();

  const errors: Record<string, string> = {
    invalid_form: t('errors.invalidForm'),
    invalid_body: t('errors.invalidBody'),
    user_not_found: t('errors.userNotFound'),
    last_owner: t('errors.lastOwner'),
    not_found: t('errors.notFound'),
    discord_unreachable: t('errors.discordUnreachable'),
    network_error: t('errors.network'),
    http_error: t('errors.unknown'),
  };

  const copy: AdminOwnershipCopy = {
    listHeading: t('list.heading'),
    listDescription: t('list.description'),
    empty: t('list.empty'),
    grantedAtLabel: t('list.grantedAt'),
    grantedByLabel: t('list.grantedBy'),
    grantedByAuto: t('list.grantedByAuto'),
    removeButton: t('list.remove'),
    removeConfirm: t('list.removeConfirm'),
    addHeading: t('add.heading'),
    addDescription: t('add.description'),
    userIdLabel: t('add.userIdLabel'),
    userIdPlaceholder: t('add.userIdPlaceholder'),
    addSubmit: t('add.submit'),
    addSuccess: t('add.success'),
    removeSuccess: t('list.removeSuccess'),
    errors,
  };

  return (
    <AdminShell
      current="ownership"
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
      <AdminOwnershipSection
        owners={owners}
        currentUserDiscordId={currentUserDiscordId}
        copy={copy}
      />
    </AdminShell>
  );
}
