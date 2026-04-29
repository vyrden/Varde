import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import {
  AdminDiscordAppForm,
  type AdminDiscordAppFormCopy,
} from '../../../components/admin/AdminDiscordAppForm';
import {
  AdminDiscordOAuthForm,
  type AdminDiscordOAuthFormCopy,
} from '../../../components/admin/AdminDiscordOAuthForm';
import {
  AdminDiscordTokenForm,
  type AdminDiscordTokenFormCopy,
} from '../../../components/admin/AdminDiscordTokenForm';
import { AdminShell, buildAdminSidebarItems } from '../../../components/admin/AdminShell';
import { fetchAdminDiscord } from '../../../lib/admin-api';

/**
 * Section 3 — Configuration Discord (`/admin/discord`). Trois
 * sous-blocs : Application Discord, Token bot, OAuth Client Secret.
 */
export default async function AdminDiscordPage(): Promise<ReactElement> {
  const discord = await fetchAdminDiscord();
  const t = await getTranslations('admin.discord');
  const tShell = await getTranslations('admin.shell');
  const session = await auth();
  const userName = session?.user?.globalName ?? session?.user?.name ?? null;
  const items = await buildAdminSidebarItems();

  const errors: Record<string, string> = {
    invalid_body: t('errors.invalidBody'),
    invalid_form: t('errors.invalidForm'),
    invalid_token: t('errors.invalidToken'),
    invalid_secret: t('errors.invalidSecret'),
    discord_app_not_found: t('errors.appNotFound'),
    discord_unreachable: t('errors.discordUnreachable'),
    missing_app_id: t('errors.missingAppId'),
    missing_bot_token: t('errors.missingBotToken'),
    app_id_mismatch: t('errors.appIdMismatch'),
    reconnect_failed: t('errors.reconnectFailed'),
    not_found: t('errors.notFound'),
    network_error: t('errors.network'),
    http_error: t('errors.unknown'),
  };

  const appCopy: AdminDiscordAppFormCopy = {
    heading: t('app.heading'),
    description: t('app.description'),
    appIdLabel: t('app.appIdLabel'),
    appIdPlaceholder: t('app.appIdPlaceholder'),
    publicKeyLabel: t('app.publicKeyLabel'),
    publicKeyPlaceholder: t('app.publicKeyPlaceholder'),
    submit: t('app.submit'),
    success: t('app.success'),
    errors,
  };

  const tokenCopy: AdminDiscordTokenFormCopy = {
    heading: t('token.heading'),
    description: t('token.description'),
    currentLabel: t('token.currentLabel'),
    tokenAbsent: t('token.tokenAbsent'),
    revealButton: t('token.revealButton'),
    hideButton: t('token.hideButton'),
    rotateOpen: t('token.rotateOpen'),
    rotateClose: t('token.rotateClose'),
    tokenLabel: t('token.tokenLabel'),
    tokenPlaceholder: t('token.tokenPlaceholder'),
    submit: t('token.submit'),
    intentsHeading: t('token.intents.heading'),
    intents: {
      presence: t('token.intents.presence'),
      members: t('token.intents.members'),
      messageContent: t('token.intents.messageContent'),
    },
    intentEnabled: t('token.intents.enabled'),
    intentDisabled: t('token.intents.disabled'),
    intentsUnknown: t('token.intents.unknown'),
    appMismatchHeading: t('token.appMismatchHeading'),
    appMismatchBody: t('token.appMismatchBody'),
    confirmRotation: t('token.confirmRotation'),
    success: t('token.success'),
    errors,
  };

  const oauthCopy: AdminDiscordOAuthFormCopy = {
    heading: t('oauth.heading'),
    description: t('oauth.description'),
    currentLabel: t('oauth.currentLabel'),
    secretAbsent: t('oauth.secretAbsent'),
    editButton: t('oauth.editButton'),
    cancelButton: t('oauth.cancelButton'),
    secretLabel: t('oauth.secretLabel'),
    secretPlaceholder: t('oauth.secretPlaceholder'),
    warning: t('oauth.warning'),
    submit: t('oauth.submit'),
    success: t('oauth.success'),
    errors,
  };

  return (
    <AdminShell
      current="discord"
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
        <AdminDiscordAppForm initial={discord} copy={appCopy} />
        <AdminDiscordTokenForm initial={discord} copy={tokenCopy} />
        <AdminDiscordOAuthForm initial={discord} copy={oauthCopy} />
      </div>
    </AdminShell>
  );
}
