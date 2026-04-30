import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SetupShell } from '../../components/setup/SetupShell';
import type { WizardStepperCopy } from '../../components/setup/WizardStepper';

const stepperCopy: WizardStepperCopy = {
  stepAriaLabelTemplate: 'Étape {current} sur {total} : {name}',
  completedPrefix: 'Étape complétée :',
  stepNames: {
    welcome: 'Accueil',
    'system-check': 'Système',
    'discord-app': 'App Discord',
    'bot-token': 'Token du bot',
    oauth: 'OAuth',
    identity: 'Identité',
    summary: 'Récap',
  },
};

describe('SetupShell', () => {
  it('affiche la marque, le badge d étape et le contenu', () => {
    render(
      SetupShell({
        currentStep: 'discord-app',
        stepIndicatorLabel: 'Étape 3 sur 7',
        stepperCopy,
        children: 'contenu',
      }),
    );
    expect(screen.getByText('Varde')).toBeDefined();
    expect(screen.getByTestId('setup-step-indicator').textContent).toBe('Étape 3 sur 7');
    expect(screen.getByText('contenu')).toBeDefined();
    expect(screen.getByTestId('wizard-stepper')).toBeDefined();
  });

  it('marque les étapes done / current / future via data-status', () => {
    render(
      SetupShell({
        currentStep: 'discord-app',
        stepIndicatorLabel: 'Étape 3 sur 7',
        stepperCopy,
        children: null,
      }),
    );
    expect(screen.getByTestId('wizard-step-welcome').getAttribute('data-status')).toBe('done');
    expect(screen.getByTestId('wizard-step-system-check').getAttribute('data-status')).toBe('done');
    expect(screen.getByTestId('wizard-step-discord-app').getAttribute('data-status')).toBe(
      'current',
    );
    expect(screen.getByTestId('wizard-step-bot-token').getAttribute('data-status')).toBe('future');
    expect(screen.getByTestId('wizard-step-summary').getAttribute('data-status')).toBe('future');
  });

  it('rend les 7 noms d étapes dans l ordre', () => {
    render(
      SetupShell({
        currentStep: 'welcome',
        stepIndicatorLabel: 'Étape 1 sur 7',
        stepperCopy,
        children: null,
      }),
    );
    for (const name of [
      'Accueil',
      'Système',
      'App Discord',
      'Token du bot',
      'OAuth',
      'Identité',
      'Récap',
    ]) {
      expect(screen.getByText(name)).toBeDefined();
    }
  });
});
