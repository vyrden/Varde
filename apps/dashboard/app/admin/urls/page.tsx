import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import {
  type AdminRedirectUrisCopy,
  AdminRedirectUrisSection,
} from '../../../components/admin/AdminRedirectUrisSection';
import { AdminShell, buildAdminSidebarItems } from '../../../components/admin/AdminShell';
import {
  type AdminUrlsAdditionalCopy,
  AdminUrlsAdditionalSection,
} from '../../../components/admin/AdminUrlsAdditionalSection';
import {
  type AdminUrlsBaseCopy,
  AdminUrlsBaseSection,
} from '../../../components/admin/AdminUrlsBaseSection';
import { fetchAdminRedirectUris, fetchAdminUrls } from '../../../lib/admin-api';

/**
 * Section 4 — URLs d'accès (`/admin/urls`). Trois sous-blocs :
 * URL principale, URLs additionnelles, redirect URIs Discord à
 * coller dans le portail OAuth2.
 *
 * Les payloads (`urls`, `redirectUris`) sont lus en parallèle au
 * server-render. Les mutations passent par les server actions de
 * `lib/admin-urls-actions.ts` qui invalident le cache du segment
 * via `revalidatePath('/admin/urls')`.
 */
export default async function AdminUrlsPage(): Promise<ReactElement> {
  const [urls, { redirectUris }] = await Promise.all([fetchAdminUrls(), fetchAdminRedirectUris()]);

  const t = await getTranslations('admin.urls');
  const tShell = await getTranslations('admin.shell');
  const session = await auth();
  const userName = session?.user?.globalName ?? session?.user?.name ?? null;
  const items = await buildAdminSidebarItems();

  const errors: Record<string, string> = {
    invalid_body: t('errors.invalidBody'),
    invalid_form: t('errors.invalidForm'),
    url_already_exists: t('errors.urlAlreadyExists'),
    url_not_found: t('errors.urlNotFound'),
    not_found: t('errors.notFound'),
    network_error: t('errors.network'),
    http_error: t('errors.unknown'),
  };

  const baseCopy: AdminUrlsBaseCopy = {
    heading: t('base.heading'),
    description: t('base.description'),
    currentLabel: t('base.currentLabel'),
    notSet: t('base.notSet'),
    editButton: t('base.editButton'),
    cancelButton: t('base.cancelButton'),
    inputLabel: t('base.inputLabel'),
    inputPlaceholder: t('base.inputPlaceholder'),
    warning: t('base.warning'),
    submit: t('base.submit'),
    success: t('base.success'),
    errors,
  };

  const additionalCopy: AdminUrlsAdditionalCopy = {
    heading: t('additional.heading'),
    description: t('additional.description'),
    empty: t('additional.empty'),
    removeButton: t('additional.remove'),
    addHeading: t('additional.addHeading'),
    urlLabel: t('additional.urlLabel'),
    urlPlaceholder: t('additional.urlPlaceholder'),
    labelLabel: t('additional.labelLabel'),
    labelPlaceholder: t('additional.labelPlaceholder'),
    submit: t('additional.submit'),
    errors,
  };

  const redirectCopy: AdminRedirectUrisCopy = {
    heading: t('redirect.heading'),
    description: t('redirect.description'),
    copyAll: t('redirect.copyAll'),
    copied: t('redirect.copied'),
    portalLabel: t('redirect.portalLabel'),
    portalLink: t('redirect.portalLink'),
  };

  return (
    <AdminShell
      current="urls"
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
      <div className="space-y-4">
        <AdminUrlsBaseSection initial={urls} copy={baseCopy} />
        <AdminUrlsAdditionalSection initial={urls} copy={additionalCopy} />
        <AdminRedirectUrisSection redirectUris={redirectUris} copy={redirectCopy} />
      </div>
    </AdminShell>
  );
}
