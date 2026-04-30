import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BotTokenForm, type BotTokenFormCopy } from '../../components/setup/BotTokenForm';

const copy: BotTokenFormCopy = {
  tokenLabel: 'Le Token du Bot',
  tokenPlaceholder: 'MTk4...',
  tokenHint: 'Chiffré au repos.',
  secretShow: 'Afficher',
  secretHide: 'Masquer',
  submit: 'Valider',
  continueLabel: 'Continuer',
  previous: 'Précédent',
  successPrefix: 'Bot identifié :',
  invalidToken: 'Token refusé.',
  intentsHeading: 'Intents privilégiés',
  intentsAllOk: 'Tous OK.',
  intentsMissing: 'Manquants.',
  intentsLabels: {
    PRESENCE: 'Presence',
    GUILD_MEMBERS: 'Members',
    MESSAGE_CONTENT: 'Content',
  },
  enableLabel: 'Activer',
  portalHref: 'https://discord.com/developers/applications',
  savedBannerLabel: 'Le token est enregistré.',
  savedBannerEdit: 'Saisir un nouveau token',
  savedBannerKeep: 'Continuer',
  errors: {},
};

describe('BotTokenForm — persistance form (PR 7.6)', () => {
  it('rend le formulaire vide quand tokenAlreadySaved=false', () => {
    render(<BotTokenForm copy={copy} />);
    expect(screen.getByLabelText(/Le Token du Bot/i)).toBeDefined();
    expect(screen.queryByTestId('bot-token-saved-banner')).toBeNull();
  });

  it('rend le banner « enregistré » quand tokenAlreadySaved=true', () => {
    render(<BotTokenForm copy={copy} tokenAlreadySaved />);
    expect(screen.getByTestId('bot-token-saved-banner')).toBeDefined();
    expect(screen.getByTestId('bot-token-edit-button')).toBeDefined();
    expect(screen.getByTestId('bot-token-keep-button')).toBeDefined();
    // L'input n'est pas rendu tant qu'on n'a pas cliqué Modifier.
    expect(screen.queryByLabelText(/Le Token du Bot/i)).toBeNull();
  });

  it('le clic sur « Modifier » bascule sur le formulaire vide', () => {
    render(<BotTokenForm copy={copy} tokenAlreadySaved />);
    fireEvent.click(screen.getByTestId('bot-token-edit-button'));
    const tokenField = screen.getByLabelText(/Le Token du Bot/i) as HTMLInputElement;
    expect(tokenField).toBeDefined();
    expect(tokenField.value).toBe('');
    expect(tokenField.type).toBe('password');
    // Le banner a disparu — on est passé en mode édition.
    expect(screen.queryByTestId('bot-token-saved-banner')).toBeNull();
  });
});
