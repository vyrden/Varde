import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { BotTokenForm } from '../../../components/setup/BotTokenForm';
import { SetupShell } from '../../../components/setup/SetupShell';
import { SetupStep } from '../../../components/setup/SetupStep';
import { fetchSetupStatus } from '../../../lib/setup-client';
import { loadStepperCopy } from '../../../lib/setup-stepper-copy';
import { SETUP_STEPS, setupStepIndex } from '../../../lib/setup-steps';

const PORTAL_URL = 'https://discord.com/developers/applications';
const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';

/**
 * Étape 4 du wizard — token bot et intents privilégiés. Server
 * component qui assemble le shell + le formulaire client `BotTokenForm`.
 * L'appel à `POST /setup/bot-token` est piloté par `submitBotToken`
 * (server action) et l'UI surface `botUser` + `missingIntents`.
 */
export default async function BotTokenPage(): Promise<ReactElement> {
  const tShell = await getTranslations('setup.shell');
  const tActions = await getTranslations('setup.actions');
  const t = await getTranslations('setup.botToken');
  const stepperCopy = await loadStepperCopy();
  const status = await fetchSetupStatus(API_URL, fetch);

  return (
    <SetupShell
      currentStep="bot-token"
      stepIndicatorLabel={tShell('stepIndicator', {
        current: setupStepIndex('bot-token'),
        total: SETUP_STEPS.length,
      })}
      stepperCopy={stepperCopy}
    >
      <SetupStep title={t('title')} description={t('subtitle')}>
        <ol className="list-decimal space-y-2 rounded-md border border-border-muted bg-sidebar p-4 pl-9 text-sm text-muted-foreground">
          <li>{t('steps.openBotTab')}</li>
          <li>{t('steps.resetToken')}</li>
          <li>{t('steps.enableIntents')}</li>
          <li>{t('steps.pasteToken')}</li>
        </ol>
        <BotTokenForm
          tokenAlreadySaved={status?.hasBotToken ?? false}
          copy={{
            tokenLabel: t('token.label'),
            tokenPlaceholder: t('token.placeholder'),
            tokenHint: t('token.hint'),
            secretShow: t('token.show'),
            secretHide: t('token.hide'),
            submit: t('submit'),
            continueLabel: tActions('next'),
            previous: tActions('previous'),
            successPrefix: t('success'),
            invalidToken: t('invalidToken'),
            intentsHeading: t('intents.heading'),
            intentsAllOk: t('intents.allOk'),
            intentsMissing: t('intents.missing'),
            intentsLabels: {
              PRESENCE: t('intents.presence'),
              GUILD_MEMBERS: t('intents.guildMembers'),
              MESSAGE_CONTENT: t('intents.messageContent'),
            },
            enableLabel: t('intents.enable'),
            portalHref: PORTAL_URL,
            savedBannerLabel: t('savedBanner.label'),
            savedBannerEdit: t('savedBanner.edit'),
            savedBannerKeep: t('savedBanner.keep'),
            errors: {
              invalid_body: t('errors.invalidBody'),
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
