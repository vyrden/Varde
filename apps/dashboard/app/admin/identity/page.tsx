import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import {
  AdminIdentityForm,
  type AdminIdentityFormCopy,
} from '../../../components/admin/AdminIdentityForm';
import { AdminShell, buildAdminSidebarItems } from '../../../components/admin/AdminShell';
import { fetchAdminIdentity } from '../../../lib/admin-api';

/**
 * Section 2 — Identité du bot (`/admin/identity`). Layout 2
 * colonnes : formulaire + aperçu temps-réel. Le payload initial
 * est lu via `GET /admin/identity` ; les mutations passent par la
 * server action `submitAdminIdentity` qui appelle `PUT
 * /admin/identity` côté API (déjà fourni par sub-livrable 4c).
 */
export default async function AdminIdentityPage(): Promise<ReactElement> {
  const identity = await fetchAdminIdentity();
  const t = await getTranslations('admin.identity');
  const tShell = await getTranslations('admin.shell');
  const session = await auth();
  const userName = session?.user?.globalName ?? session?.user?.name ?? null;
  const items = await buildAdminSidebarItems();

  const copy: AdminIdentityFormCopy = {
    nameLabel: t('form.name.label'),
    namePlaceholder: t('form.name.placeholder'),
    avatarLabel: t('form.avatar.label'),
    avatarHint: t('form.avatar.hint'),
    avatarRemove: t('form.avatar.remove'),
    descriptionLabel: t('form.description.label'),
    descriptionPlaceholder: t('form.description.placeholder'),
    submit: t('form.submit'),
    reset: t('form.reset'),
    previewHeading: t('preview.heading'),
    previewEmptyName: t('preview.emptyName'),
    previewEmptyDescription: t('preview.emptyDescription'),
    success: t('success'),
    rateLimited: t('errors.rateLimited'),
    errors: {
      invalid_body: t('errors.invalidBody'),
      missing_bot_token: t('errors.missingBotToken'),
      missing_app_id: t('errors.missingAppId'),
      discord_unreachable: t('errors.discordUnreachable'),
      rate_limited: t('errors.rateLimited'),
      not_found: t('errors.notFound'),
      network_error: t('errors.network'),
      http_error: t('errors.unknown'),
    },
  };

  return (
    <AdminShell
      current="identity"
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
      <AdminIdentityForm initial={identity} copy={copy} />
    </AdminShell>
  );
}
