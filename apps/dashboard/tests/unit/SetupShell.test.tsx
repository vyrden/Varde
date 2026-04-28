import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SetupShell } from '../../components/setup/SetupShell';

describe('SetupShell', () => {
  it('affiche la marque, le badge d étape et le contenu', () => {
    render(
      SetupShell({
        currentStep: 'discord-app',
        stepIndicatorLabel: 'Étape 3 sur 7',
        progressLabel: 'Avancement de la configuration',
        children: 'contenu',
      }),
    );
    expect(screen.getByText('Varde')).toBeDefined();
    expect(screen.getByTestId('setup-step-indicator').textContent).toBe('Étape 3 sur 7');
    expect(screen.getByText('contenu')).toBeDefined();
  });

  it('expose la progress bar avec aria-valuenow=index 1-based', () => {
    render(
      SetupShell({
        currentStep: 'welcome',
        stepIndicatorLabel: 'Étape 1 sur 7',
        progressLabel: 'Avancement',
        children: null,
      }),
    );
    const bar = screen.getByTestId('setup-progress');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('7');
    expect(bar.getAttribute('aria-label')).toBe('Avancement');
  });

  it('aria-valuenow reflète l étape summary (7)', () => {
    render(
      SetupShell({
        currentStep: 'summary',
        stepIndicatorLabel: 'Étape 7 sur 7',
        progressLabel: 'Avancement',
        children: null,
      }),
    );
    expect(screen.getByTestId('setup-progress').getAttribute('aria-valuenow')).toBe('7');
  });
});
