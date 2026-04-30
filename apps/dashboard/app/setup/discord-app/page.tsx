import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { DiscordAppForm } from '../../../components/setup/DiscordAppForm';
import { SetupShell } from '../../../components/setup/SetupShell';
import { SetupStep } from '../../../components/setup/SetupStep';
import { loadStepperCopy } from '../../../lib/setup-stepper-copy';
import { SETUP_STEPS, setupStepIndex } from '../../../lib/setup-steps';

const PORTAL_URL = 'https://discord.com/developers/applications';

/**
 * Étape 3 du wizard — Application ID + Public Key Discord. Server
 * component qui assemble le shell + le formulaire client. La logique
 * d'appel API et la gestion d'état vivent dans `DiscordAppForm`.
 */
export default async function DiscordAppPage(): Promise<ReactElement> {
  const tShell = await getTranslations('setup.shell');
  const tActions = await getTranslations('setup.actions');
  const t = await getTranslations('setup.discordApp');
  const stepperCopy = await loadStepperCopy();

  return (
    <SetupShell
      currentStep="discord-app"
      stepIndicatorLabel={tShell('stepIndicator', {
        current: setupStepIndex('discord-app'),
        total: SETUP_STEPS.length,
      })}
      stepperCopy={stepperCopy}
    >
      <SetupStep title={t('title')} description={t('subtitle')}>
        <ol className="list-decimal space-y-2 rounded-md border border-border-muted bg-sidebar p-4 pl-9 text-sm text-muted-foreground">
          <li>{t('steps.openPortal')}</li>
          <li>{t('steps.createApp')}</li>
          <li>{t('steps.copyAppId')}</li>
          <li>{t('steps.copyPublicKey')}</li>
        </ol>
        <a
          href={PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('openPortal')}
        </a>
        <DiscordAppForm
          copy={{
            appIdLabel: t('appId.label'),
            appIdPlaceholder: t('appId.placeholder'),
            publicKeyLabel: t('publicKey.label'),
            publicKeyPlaceholder: t('publicKey.placeholder'),
            submit: t('submit'),
            continueLabel: tActions('next'),
            previous: tActions('previous'),
            successPrefix: t('success'),
            errors: {
              invalid_body: t('errors.invalidBody'),
              discord_app_not_found: t('errors.notFound'),
              discord_unreachable: t('errors.unreachable'),
              network_error: t('errors.network'),
              http_error: t('errors.unknown'),
            },
          }}
        />
      </SetupStep>
    </SetupShell>
  );
}
