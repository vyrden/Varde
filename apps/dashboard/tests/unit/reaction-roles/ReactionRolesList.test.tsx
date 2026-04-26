import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReactionRolesList } from '../../../components/reaction-roles/ReactionRolesList';

afterEach(cleanup);

const msg = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Continents',
  channelId: '111',
  messageId: '222',
  message: 'Choisis ton continent',
  mode: 'unique' as const,
  feedback: 'dm' as const,
  pairs: [
    {
      kind: 'reaction' as const,
      emoji: { type: 'unicode' as const, value: '🇪🇺' },
      roleId: '333',
      label: '',
      style: 'secondary' as const,
    },
  ],
};

const baseProps = {
  guildId: 'g1',
  channelNameById: {},
  version: '1.0.0',
  isEnabled: true,
  onAddNew: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe('ReactionRolesList', () => {
  it("affiche un état vide quand aucun message n'est configuré", () => {
    render(<ReactionRolesList {...baseProps} messages={[]} />);
    expect(screen.getByText(/Aucun reaction-role configuré/i)).toBeDefined();
  });

  it('affiche les messages avec label + mode', () => {
    render(
      <ReactionRolesList {...baseProps} messages={[msg]} channelNameById={{ '111': 'roles' }} />,
    );
    expect(screen.getByText('Continents')).toBeDefined();
    expect(screen.getByText('#roles')).toBeDefined();
    expect(screen.getByText('Unique')).toBeDefined();
  });

  it('clic + Nouveau appelle onAddNew', () => {
    const onAddNew = vi.fn();
    render(<ReactionRolesList {...baseProps} messages={[]} onAddNew={onAddNew} />);
    fireEvent.click(screen.getByRole('button', { name: /Nouveau reaction-role/i }));
    expect(onAddNew).toHaveBeenCalled();
  });

  it("clic Éditer appelle onEdit avec l'id", () => {
    const onEdit = vi.fn();
    render(<ReactionRolesList {...baseProps} messages={[msg]} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /Éditer Continents/i }));
    expect(onEdit).toHaveBeenCalledWith(msg.id);
  });

  it("clic Supprimer puis Confirmer appelle onDelete avec l'id", () => {
    const onDelete = vi.fn();
    render(<ReactionRolesList {...baseProps} messages={[msg]} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /Supprimer Continents/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmer$/i }));
    expect(onDelete).toHaveBeenCalledWith(msg.id);
  });

  it('affiche le nombre correct de messages publiés', () => {
    const msg2 = { ...msg, id: 'aaaa', label: 'Couleurs', messageId: '555' };
    render(<ReactionRolesList {...baseProps} messages={[msg, msg2]} />);
    expect(screen.getByText(/2 messages publiés/i)).toBeDefined();
  });
});
