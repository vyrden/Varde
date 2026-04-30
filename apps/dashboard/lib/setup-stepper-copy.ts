import { getTranslations } from 'next-intl/server';

import type { WizardStepperCopy } from '../components/setup/WizardStepper';

/**
 * Petit helper qui assemble le `WizardStepperCopy` à partir de
 * `setup.shell.stepper.*` côté next-intl. Factorisé pour éviter
 * que chaque page de setup ne ré-écrive la même paperasse i18n.
 *
 * Server-only (utilise `getTranslations` qui résout depuis le
 * cookie côté server component).
 */
export async function loadStepperCopy(): Promise<WizardStepperCopy> {
  const t = await getTranslations('setup.shell.stepper');
  return {
    // `t.raw()` plutôt que `t()` parce que la chaîne contient des
    // placeholders `{current}` / `{total}` / `{name}` que c'est
    // notre `renderTemplate` (côté composant) qui doit interpoler,
    // pas next-intl. Sans ça, next-intl essaie d'interpoler dès la
    // lecture et lance un `FORMATTING_ERROR`.
    stepAriaLabelTemplate: t.raw('stepAriaLabelTemplate') as string,
    completedPrefix: t('completedPrefix'),
    stepNames: {
      welcome: t('names.welcome'),
      'system-check': t('names.system-check'),
      'discord-app': t('names.discord-app'),
      'bot-token': t('names.bot-token'),
      oauth: t('names.oauth'),
      identity: t('names.identity'),
      summary: t('names.summary'),
    },
  };
}
