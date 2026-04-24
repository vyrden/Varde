import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReactionRolesList } from '../../../components/reaction-roles/ReactionRolesList';

afterEach(cleanup);

const msg = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Continents',
  channelId: '111',
  messageId: '222',
  mode: 'unique' as const,
  pairs: [{ emoji: { type: 'unicode' as const, value: '🇪🇺' }, roleId: '333' }],
};

describe('ReactionRolesList', () => {
  it("affiche 'Aucun message' quand liste vide", () => {
    render(
      <ReactionRolesList
        messages={[]}
        channelNameById={{}}
        onAddNew={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Aucun message/i)).toBeDefined();
  });

  it('affiche les messages avec label + mode', () => {
    render(
      <ReactionRolesList
        messages={[msg]}
        channelNameById={{ '111': 'roles' }}
        onAddNew={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('Continents')).toBeDefined();
    expect(screen.getByText('#roles')).toBeDefined();
    expect(screen.getByText('Unique')).toBeDefined();
  });

  it('clic + Nouveau appelle onAddNew', () => {
    const onAddNew = vi.fn();
    render(
      <ReactionRolesList
        messages={[]}
        channelNameById={{}}
        onAddNew={onAddNew}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nouveau reaction-role/i }));
    expect(onAddNew).toHaveBeenCalled();
  });

  it("clic Éditer appelle onEdit avec l'id", () => {
    const onEdit = vi.fn();
    render(
      <ReactionRolesList
        messages={[msg]}
        channelNameById={{}}
        onAddNew={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Éditer/i }));
    expect(onEdit).toHaveBeenCalledWith(msg.id);
  });

  it("clic × appelle onDelete avec l'id", () => {
    const onDelete = vi.fn();
    render(
      <ReactionRolesList
        messages={[msg]}
        channelNameById={{}}
        onAddNew={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /×/i }));
    expect(onDelete).toHaveBeenCalledWith(msg.id);
  });

  it('affiche le nombre correct de messages publiés', () => {
    const msg2 = { ...msg, id: 'aaaa', label: 'Couleurs', messageId: '555' };
    render(
      <ReactionRolesList
        messages={[msg, msg2]}
        channelNameById={{}}
        onAddNew={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 messages publiés/i)).toBeDefined();
  });
});
