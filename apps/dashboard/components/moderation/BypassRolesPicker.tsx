'use client';

import type { ReactElement } from 'react';

import { EntityMultiPicker } from '../shared/EntityMultiPicker';
import type { RoleOption } from './types';

export interface BypassRolesPickerProps {
  readonly roles: readonly RoleOption[];
  readonly selectedIds: ReadonlyArray<string>;
  readonly pending: boolean;
  readonly onChange: (next: ReadonlyArray<string>) => void;
}

/**
 * Sélecteur multi-rôles pour les rôles bypass de l'automod. Wrapper
 * thin autour de `EntityMultiPicker` (composant générique partagé
 * avec le module logs pour les filtres rôles/salons).
 */
export function BypassRolesPicker({
  roles,
  selectedIds,
  pending,
  onChange,
}: BypassRolesPickerProps): ReactElement {
  return (
    <EntityMultiPicker
      entityKind="role"
      entities={roles}
      selectedIds={selectedIds}
      pending={pending}
      onChange={onChange}
      emptyLabel="Aucun rôle bypass"
    />
  );
}
