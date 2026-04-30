import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  RoleMultiSelect,
  type RoleMultiSelectCopy,
  type RoleOption,
} from '../../components/permissions/RoleMultiSelect';

const copy: RoleMultiSelectCopy = {
  searchPlaceholder: 'Rechercher un rôle…',
  empty: 'Aucun rôle trouvé.',
  memberCountTemplate: '{count} membres',
  disabledLabel: 'verrouillé',
};

const ROLES: RoleOption[] = [
  { id: 'r-admin', name: 'Admin', color: 0xff0000, position: 10, memberCount: 3 },
  { id: 'r-mod', name: 'Moderator', color: 0x00ff00, position: 5, memberCount: 7 },
  { id: 'r-everyone', name: 'Member', position: 1, memberCount: 100 },
];

describe('RoleMultiSelect', () => {
  it('rend les rôles triés par position décroissante', () => {
    render(<RoleMultiSelect roles={ROLES} selected={[]} onChange={() => undefined} copy={copy} />);
    const labels = screen.getAllByRole('checkbox').map((cb) => cb.getAttribute('data-testid'));
    expect(labels).toEqual([
      'role-multiselect-checkbox-r-admin',
      'role-multiselect-checkbox-r-mod',
      'role-multiselect-checkbox-r-everyone',
    ]);
  });

  it('coche/décoche un rôle au click', () => {
    const onChange = vi.fn();
    render(<RoleMultiSelect roles={ROLES} selected={['r-mod']} onChange={onChange} copy={copy} />);
    const adminCheckbox = screen.getByTestId('role-multiselect-checkbox-r-admin');
    fireEvent.click(adminCheckbox);
    expect(onChange).toHaveBeenCalledWith(['r-mod', 'r-admin']);

    onChange.mockClear();
    const modCheckbox = screen.getByTestId('role-multiselect-checkbox-r-mod');
    fireEvent.click(modCheckbox);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('filtre par recherche par nom (case-insensitive)', () => {
    render(<RoleMultiSelect roles={ROLES} selected={[]} onChange={() => undefined} copy={copy} />);
    const search = screen.getByTestId('role-multiselect-search');
    fireEvent.change(search, { target: { value: 'mod' } });
    expect(screen.queryByTestId('role-multiselect-checkbox-r-admin')).toBeNull();
    expect(screen.getByTestId('role-multiselect-checkbox-r-mod')).toBeDefined();
  });

  it('affiche l état vide quand la recherche ne retourne rien', () => {
    render(<RoleMultiSelect roles={ROLES} selected={[]} onChange={() => undefined} copy={copy} />);
    fireEvent.change(screen.getByTestId('role-multiselect-search'), {
      target: { value: 'inconnu' },
    });
    expect(screen.getByText('Aucun rôle trouvé.')).toBeDefined();
  });

  it('un rôle disabled n est pas cochable', () => {
    const onChange = vi.fn();
    render(
      <RoleMultiSelect
        roles={ROLES}
        selected={[]}
        onChange={onChange}
        copy={copy}
        disabledRoleIds={['r-admin']}
      />,
    );
    const adminCheckbox = screen.getByTestId(
      'role-multiselect-checkbox-r-admin',
    ) as HTMLInputElement;
    expect(adminCheckbox.disabled).toBe(true);
    fireEvent.click(adminCheckbox);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('verrouillé')).toBeDefined();
  });

  it('affiche le memberCount fourni', () => {
    render(<RoleMultiSelect roles={ROLES} selected={[]} onChange={() => undefined} copy={copy} />);
    expect(screen.getByText('3 membres')).toBeDefined();
    expect(screen.getByText('7 membres')).toBeDefined();
  });
});
