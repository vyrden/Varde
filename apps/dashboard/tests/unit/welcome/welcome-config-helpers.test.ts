import { describe, expect, it } from 'vitest';

import type {
  GoodbyeBlock,
  WelcomeBlock,
  WelcomeConfigClient,
} from '../../../components/welcome/types';
import {
  evaluateWelcomeValidity,
  findOrphanRoleIds,
  formatTestReason,
  isAdvancedConfig,
  isGoodbyeIncomplete,
  isWelcomeIncomplete,
  SAMPLE_PREVIEW_VARIABLES,
} from '../../../components/welcome/welcome-config-helpers';

const baseWelcome: WelcomeBlock = {
  enabled: false,
  destination: 'channel',
  channelId: null,
  message: '',
  embed: { enabled: false, color: '#5865F2' },
  card: {
    enabled: false,
    backgroundColor: '#2C2F33',
    backgroundImagePath: null,
    text: { titleFontSize: 32, subtitleFontSize: 20, fontFamily: 'sans-serif' },
  },
};

const baseGoodbye: GoodbyeBlock = {
  enabled: false,
  channelId: null,
  message: '',
  embed: { enabled: false, color: '#5865F2' },
  card: {
    enabled: false,
    backgroundColor: '#2C2F33',
    backgroundImagePath: null,
    text: { titleFontSize: 32, subtitleFontSize: 20, fontFamily: 'sans-serif' },
  },
};

const baseConfig: WelcomeConfigClient = {
  version: 1,
  welcome: baseWelcome,
  goodbye: baseGoodbye,
  autorole: { enabled: false, roleIds: [], delaySeconds: 0 },
  accountAgeFilter: { enabled: false, minDays: 0, action: 'kick', quarantineRoleId: null },
};

describe('isWelcomeIncomplete', () => {
  it('false si la section est désactivée, même sans salon', () => {
    expect(isWelcomeIncomplete({ ...baseWelcome, enabled: false, channelId: null })).toBe(false);
  });

  it('false si destination=dm, le salon n est pas requis', () => {
    expect(
      isWelcomeIncomplete({ ...baseWelcome, enabled: true, destination: 'dm', channelId: null }),
    ).toBe(false);
  });

  it('true si activée + destination=channel sans salon', () => {
    expect(
      isWelcomeIncomplete({
        ...baseWelcome,
        enabled: true,
        destination: 'channel',
        channelId: null,
      }),
    ).toBe(true);
  });

  it('true si activée + destination=both sans salon', () => {
    expect(
      isWelcomeIncomplete({ ...baseWelcome, enabled: true, destination: 'both', channelId: null }),
    ).toBe(true);
  });

  it('false si activée et un salon est sélectionné', () => {
    expect(
      isWelcomeIncomplete({
        ...baseWelcome,
        enabled: true,
        destination: 'channel',
        channelId: 'C-1',
      }),
    ).toBe(false);
  });
});

describe('isGoodbyeIncomplete', () => {
  it('false si désactivée', () => {
    expect(isGoodbyeIncomplete({ ...baseGoodbye, enabled: false, channelId: null })).toBe(false);
  });

  it('true si activée sans salon (channel-only)', () => {
    expect(isGoodbyeIncomplete({ ...baseGoodbye, enabled: true, channelId: null })).toBe(true);
  });

  it('false si activée avec salon', () => {
    expect(isGoodbyeIncomplete({ ...baseGoodbye, enabled: true, channelId: 'C-1' })).toBe(false);
  });
});

describe('evaluateWelcomeValidity', () => {
  it('canSave=true sur la config par défaut (tout désactivé)', () => {
    const v = evaluateWelcomeValidity(baseConfig);
    expect(v.canSave).toBe(true);
    expect(v.welcomeIncomplete).toBe(false);
    expect(v.goodbyeIncomplete).toBe(false);
  });

  it('canSave=false si welcome activé sans salon', () => {
    const v = evaluateWelcomeValidity({
      ...baseConfig,
      welcome: { ...baseWelcome, enabled: true, channelId: null },
    });
    expect(v.canSave).toBe(false);
    expect(v.welcomeIncomplete).toBe(true);
  });

  it('canSave=false si goodbye activé sans salon', () => {
    const v = evaluateWelcomeValidity({
      ...baseConfig,
      goodbye: { ...baseGoodbye, enabled: true, channelId: null },
    });
    expect(v.canSave).toBe(false);
    expect(v.goodbyeIncomplete).toBe(true);
  });

  it('canSave=true si welcome activé en DM uniquement (pas de salon requis)', () => {
    const v = evaluateWelcomeValidity({
      ...baseConfig,
      welcome: { ...baseWelcome, enabled: true, destination: 'dm', channelId: null },
    });
    expect(v.canSave).toBe(true);
  });
});

describe('isAdvancedConfig', () => {
  it('false sur la config par défaut', () => {
    expect(isAdvancedConfig(baseConfig)).toBe(false);
  });

  it('true si auto-rôle activé', () => {
    expect(
      isAdvancedConfig({
        ...baseConfig,
        autorole: { enabled: true, roleIds: ['R-1'], delaySeconds: 0 },
      }),
    ).toBe(true);
  });

  it('true si filtre comptes neufs activé', () => {
    expect(
      isAdvancedConfig({
        ...baseConfig,
        accountAgeFilter: {
          enabled: true,
          minDays: 7,
          action: 'kick',
          quarantineRoleId: null,
        },
      }),
    ).toBe(true);
  });
});

describe('formatTestReason', () => {
  it('traduit les codes connus', () => {
    expect(formatTestReason('service-indisponible')).toBe('Le bot Discord est indisponible.');
    expect(formatTestReason('channel-requis')).toBe('Choisis un salon avant de tester.');
    expect(formatTestReason('autorole-désactivé')).toMatch(/Active l'auto-rôle/);
  });

  it('formate les erreurs HTTP', () => {
    expect(formatTestReason('http-403')).toBe('Erreur HTTP 403.');
  });

  it('garde les codes inconnus avec préfixe Erreur', () => {
    expect(formatTestReason('mystery-fail')).toBe('Erreur : mystery-fail');
  });
});

describe('findOrphanRoleIds', () => {
  const ROLES = [
    { id: '1', name: 'Member' },
    { id: '2', name: 'VIP' },
  ];

  it('retourne vide si tous les ids configurés existent', () => {
    expect(findOrphanRoleIds(['1', '2'], ROLES)).toEqual([]);
  });

  it('retourne les ids absents du catalogue', () => {
    expect(findOrphanRoleIds(['1', '999'], ROLES)).toEqual(['999']);
  });

  it('retourne tous les ids si le catalogue est vide', () => {
    expect(findOrphanRoleIds(['1', '2'], [])).toEqual(['1', '2']);
  });

  it('retourne vide pour une liste configurée vide', () => {
    expect(findOrphanRoleIds([], ROLES)).toEqual([]);
  });

  it("préserve l'ordre des ids configurés", () => {
    expect(findOrphanRoleIds(['999', '1', '888'], ROLES)).toEqual(['999', '888']);
  });
});

describe('SAMPLE_PREVIEW_VARIABLES', () => {
  it('expose les clés attendues par le PreviewPanel', () => {
    expect(SAMPLE_PREVIEW_VARIABLES['user']).toBe('Alice');
    expect(SAMPLE_PREVIEW_VARIABLES['user.mention']).toMatch(/^<@\d+>$/);
    expect(SAMPLE_PREVIEW_VARIABLES['guild']).toBe('Aperçu');
    expect(SAMPLE_PREVIEW_VARIABLES['memberCount']).toBe(42);
  });
});
