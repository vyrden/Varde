import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { CopyableField } from '../../../components/setup/CopyableField';
import { OAuthForm } from '../../../components/setup/OAuthForm';
import { SetupShell } from '../../../components/setup/SetupShell';
import { SetupStep } from '../../../components/setup/SetupStep';
import { fetchSetupStatus } from '../../../lib/setup-client';
import { fetchRedirectUri } from '../../../lib/setup-redirect-uri';
import { loadStepperCopy } from '../../../lib/setup-stepper-copy';
import { SETUP_STEPS, setupStepIndex } from '../../../lib/setup-steps';

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';

/**
 * Étape 5 du wizard — OAuth (client secret + redirect URI). Server
 * component qui :
 *
 * 1. Fetch l'URI de redirection auprès de l'API (dérivée du `baseUrl`
 *    côté serveur — on évite de la calculer localement avec un risque
 *    de drift).
 * 2. L'affiche en `CopyableField` pour que l'admin la colle dans
 *    le portail Discord.
 * 3. Délègue la saisie/validation du client secret à `OAuthForm`.
 */
export default async function OAuthPage(): Promise<ReactElement> {
  const tShell = await getTranslations('setup.shell');
  const tActions = await getTranslations('setup.actions');
  const t = await getTranslations('setup.oauth');
  const stepperCopy = await loadStepperCopy();

  const redirectResult = await fetchRedirectUri(API_URL, fetch);
  const redirectUri = redirectResult.ok ? redirectResult.uri : '';
  const status = await fetchSetupStatus(API_URL, fetch);

  return (
    <SetupShell
      currentStep="oauth"
      stepIndicatorLabel={tShell('stepIndicator', {
        current: setupStepIndex('oauth'),
        total: SETUP_STEPS.length,
      })}
      stepperCopy={stepperCopy}
    >
      <SetupStep title={t('title')} description={t('subtitle')}>
        <ol className="list-decimal space-y-2 rounded-md border border-border-muted bg-sidebar p-4 pl-9 text-sm text-muted-foreground">
          <li>{t('steps.openOAuthTab')}</li>
          <li>{t('steps.pasteRedirect')}</li>
          <li>{t('steps.copySecret')}</li>
          <li>{t('steps.pasteSecret')}</li>
        </ol>
        {redirectResult.ok ? (
          <CopyableField
            label={t('redirect.label')}
            value={redirectUri}
            copyLabel={t('redirect.copy')}
            copiedLabel={t('redirect.copied')}
            hint={t('redirect.hint')}
          />
        ) : (
          <div
            className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
            data-testid="redirect-uri-error"
          >
            {t('redirect.unreachable')}
            <p className="mt-1 text-xs opacity-80">{redirectResult.message}</p>
          </div>
        )}
        <OAuthForm
          secretAlreadySaved={status?.hasClientSecret ?? false}
          copy={{
            secretLabel: t('secret.label'),
            secretPlaceholder: t('secret.placeholder'),
            secretHint: t('secret.hint'),
            secretShow: t('secret.show'),
            secretHide: t('secret.hide'),
            submit: t('submit'),
            continueLabel: tActions('next'),
            previous: tActions('previous'),
            success: t('success'),
            invalidSecret: t('invalidSecret'),
            savedBannerLabel: t('savedBanner.label'),
            savedBannerEdit: t('savedBanner.edit'),
            savedBannerKeep: t('savedBanner.keep'),
            errors: {
              invalid_body: t('errors.invalidBody'),
              missing_app_id: t('errors.missingAppId'),
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
