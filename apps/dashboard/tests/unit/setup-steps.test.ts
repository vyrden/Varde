import { describe, expect, it } from 'vitest';

import {
  nextSetupStep,
  previousSetupStep,
  SETUP_STEPS,
  setupStepFromIndex,
  setupStepHref,
  setupStepIndex,
} from '../../lib/setup-steps';

describe('SETUP_STEPS', () => {
  it('expose les 7 étapes du wizard dans l ordre du wireframe', () => {
    expect(SETUP_STEPS).toEqual([
      'welcome',
      'system-check',
      'discord-app',
      'bot-token',
      'oauth',
      'identity',
      'summary',
    ]);
  });
});

describe('setupStepIndex', () => {
  it('mappe welcome → 1, summary → 7', () => {
    expect(setupStepIndex('welcome')).toBe(1);
    expect(setupStepIndex('summary')).toBe(7);
  });

  it('mappe system-check → 2', () => {
    expect(setupStepIndex('system-check')).toBe(2);
  });
});

describe('setupStepFromIndex', () => {
  it('inverse setupStepIndex', () => {
    expect(setupStepFromIndex(1)).toBe('welcome');
    expect(setupStepFromIndex(7)).toBe('summary');
  });

  it('retourne null hors plage', () => {
    expect(setupStepFromIndex(0)).toBeNull();
    expect(setupStepFromIndex(8)).toBeNull();
  });
});

describe('setupStepHref', () => {
  it('renvoie /setup/{key}', () => {
    expect(setupStepHref('welcome')).toBe('/setup/welcome');
    expect(setupStepHref('system-check')).toBe('/setup/system-check');
  });
});

describe('nextSetupStep', () => {
  it('renvoie l étape suivante', () => {
    expect(nextSetupStep('welcome')).toBe('system-check');
    expect(nextSetupStep('oauth')).toBe('identity');
  });

  it('renvoie null sur la dernière étape', () => {
    expect(nextSetupStep('summary')).toBeNull();
  });
});

describe('previousSetupStep', () => {
  it('renvoie l étape précédente', () => {
    expect(previousSetupStep('system-check')).toBe('welcome');
    expect(previousSetupStep('summary')).toBe('identity');
  });

  it('renvoie null sur welcome (première étape)', () => {
    expect(previousSetupStep('welcome')).toBeNull();
  });
});
