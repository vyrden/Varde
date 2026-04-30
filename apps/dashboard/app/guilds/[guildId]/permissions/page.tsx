import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../../../../auth';
import {
  GuildPermissionsEditor,
  type GuildPermissionsEditorCopy,
} from '../../../../components/permissions/GuildPermissionsEditor';
import { ApiError, fetchGuildPermissionsConfig } from '../../../../lib/api-client';

/**
 * Page de configuration des permissions par-guild (jalon 7 PR 7.3
 * sub-livrable 8).
 *
 * Garde-fou : la page elle-même est protégée par le layout parent
 * (`/guilds/[guildId]/layout.tsx`) qui exige une session active.
 * L'API renvoie 404 pour un user sans accès admin sur la guild ;
 * on remonte ça en `notFound()` ici pour reproduire le 404 côté UI.
 */
export default async function GuildPermissionsPage({
  params,
}: {
  readonly params: Promise<{ readonly guildId: string }>;
}): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let config: Awaited<ReturnType<typeof fetchGuildPermissionsConfig>>;
  try {
    config = await fetchGuildPermissionsConfig(guildId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const t = await getTranslations('guildPermissions');
  const errors: Record<string, string> = {
    invalid_form: t('errors.invalidForm'),
    invalid_body: t('errors.invalidBody'),
    invalid_permissions: t('errors.invalidPermissions'),
    unknown_role_ids: t('errors.unknownRoleIds'),
    not_found: t('errors.notFound'),
    network_error: t('errors.network'),
    http_error: t('errors.unknown'),
  };

  const copy: GuildPermissionsEditorCopy = {
    adminHeading: t('admin.heading'),
    adminDescription: t('admin.description'),
    moderatorHeading: t('moderator.heading'),
    moderatorDescription: t('moderator.description'),
    saveButton: t('saveButton'),
    previewButton: t('previewButton'),
    successMessage: t('successMessage'),
    emptyAdminWarning: t('emptyAdminWarning'),
    removeSelfWarning: t('removeSelfWarning'),
    previewHeading: t('previewHeading'),
    previewAdminsLabel: t('previewAdminsLabel'),
    previewModeratorsLabel: t('previewModeratorsLabel'),
    previewEmpty: t('previewEmpty'),
    errors,
    roleMultiSelect: {
      searchPlaceholder: t('roleSelect.searchPlaceholder'),
      empty: t('roleSelect.empty'),
      // Template avec placeholder `{count}` — le client remplace
      // au render. `t.raw()` retourne la chaîne brute sans
      // tentative ICU (sinon next-intl exigerait un argument
      // `count` à la résolution serveur).
      memberCountTemplate: t.raw('roleSelect.memberCountTemplate') as string,
      disabledLabel: t('roleSelect.disabledLabel'),
    },
  };

  // currentUserRoleIds : pour le warning « retirer son propre accès ».
  // Sans Discord API direct côté dashboard, on dérive depuis la
  // session — le user est censé avoir au moins un rôle dans
  // `adminRoleIds` puisqu'il accède à cette page.
  const currentUserRoleIds = config.adminRoleIds;

  return (
    <div className="space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <GuildPermissionsEditor
        guildId={guildId}
        initial={config}
        currentUserRoleIds={currentUserRoleIds}
        copy={copy}
      />
    </div>
  );
}
