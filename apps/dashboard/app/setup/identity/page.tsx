import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { IdentityForm } from '../../../components/setup/IdentityForm';
import { SetupShell } from '../../../components/setup/SetupShell';
import { SetupStep } from '../../../components/setup/SetupStep';
import { fetchSetupStatus } from '../../../lib/setup-client';
import { loadStepperCopy } from '../../../lib/setup-stepper-copy';
import { SETUP_STEPS, setupStepIndex } from '../../../lib/setup-steps';

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';

/**
 * Étape 6 du wizard — identité du bot (optionnelle). Server
 * component qui assemble le shell + le formulaire client. Le
 * bouton « Passer » est un Link vers `/setup/summary` (l'API
 * accepte un body vide et bumpe juste `setup_step`, mais on évite
 * un round-trip inutile en court-circuitant côté navigation).
 */
export default async function IdentityPage(): Promise<ReactElement> {
  const tShell = await getTranslations('setup.shell');
  const tActions = await getTranslations('setup.actions');
  const t = await getTranslations('setup.identity');
  const stepperCopy = await loadStepperCopy();
  const status = await fetchSetupStatus(API_URL, fetch);

  return (
    <SetupShell
      currentStep="identity"
      stepIndicatorLabel={tShell('stepIndicator', {
        current: setupStepIndex('identity'),
        total: SETUP_STEPS.length,
      })}
      stepperCopy={stepperCopy}
    >
      <SetupStep title={t('title')} description={t('subtitle')}>
        <p className="rounded-md border border-border-muted bg-sidebar p-4 text-sm text-muted-foreground">
          {t('editLater')}
        </p>
        <IdentityForm
          initialName={status?.botName ?? null}
          initialDescription={status?.botDescription ?? null}
          initialAvatarUrl={status?.botAvatarUrl ?? null}
          initialBannerUrl={status?.botBannerUrl ?? null}
          copy={{
            nameLabel: t('name.label'),
            namePlaceholder: t('name.placeholder'),
            avatar: {
              label: t('avatar.label'),
              hint: t('avatar.hint'),
              dropPrompt: t('avatar.dropPrompt'),
              remove: t('avatar.remove'),
              errorUnsupportedType: t('avatar.errorUnsupportedType'),
              errorTooLarge: t.raw('avatar.errorTooLarge') as string,
            },
            avatarSavedLabel: t('avatar.savedLabel'),
            banner: {
              label: t('banner.label'),
              hint: t('banner.hint'),
              dropPrompt: t('banner.dropPrompt'),
              remove: t('banner.remove'),
              errorUnsupportedType: t('banner.errorUnsupportedType'),
              errorTooLarge: t.raw('banner.errorTooLarge') as string,
            },
            bannerSavedLabel: t('banner.savedLabel'),
            descriptionLabel: t('description.label'),
            descriptionPlaceholder: t('description.placeholder'),
            skip: t('skip'),
            continueLabel: tActions('next'),
            previous: tActions('previous'),
            saving: t('saving'),
            saved: t('saved'),
            errors: {
              invalid_body: t('errors.invalidBody'),
              missing_bot_token: t('errors.missingBotToken'),
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
