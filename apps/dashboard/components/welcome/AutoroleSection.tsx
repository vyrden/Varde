'use client';

import { Button, Select } from '@varde/ui';

import type { WelcomeConfigClient } from '../../lib/welcome-actions';
import { EntityMultiPicker } from '../shared/EntityMultiPicker';
import { findOrphanRoleIds } from './welcome-config-helpers';

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface AutoroleSectionProps {
  readonly value: WelcomeConfigClient['autorole'];
  readonly onChange: (next: WelcomeConfigClient['autorole']) => void;
  readonly roles: readonly RoleOption[];
  readonly pending?: boolean;
}

const DELAY_OPTIONS = [
  { value: 0, label: 'Immédiat' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 3600, label: '1 heure' },
  { value: 86_400, label: '24 heures' },
];

const MAX_ROLES = 10;

/**
 * Contenu de la sous-section Auto-rôle. L'activation est pilotée par
 * la card parente (AdvancedConfigSection) ; on suppose ici que le
 * composant n'est rendu que lorsque `value.enabled === true`.
 */
export function AutoroleSection({ value, onChange, roles, pending = false }: AutoroleSectionProps) {
  const atLimit = value.roleIds.length >= MAX_ROLES;
  // Rôles enregistrés mais introuvables côté Discord (supprimés ou
  // permissions changées) — `EntityMultiPicker` les masque en
  // affichage parce qu'il filtre sur `entities`. Sans signal, l'admin
  // ne sait pas qu'ils existent encore en config.
  const orphanRoleIds = findOrphanRoleIds(value.roleIds, roles);
  const orphanSet = new Set(orphanRoleIds);
  const handlePurgeOrphans = (): void => {
    onChange({
      ...value,
      roleIds: value.roleIds.filter((id) => !orphanSet.has(id)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Rôles à attribuer (max {MAX_ROLES})</p>
        {roles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun rôle disponible. Crée des rôles dans Discord puis recharge la page.
          </p>
        ) : (
          <EntityMultiPicker
            entityKind="role"
            entities={roles}
            selectedIds={value.roleIds}
            pending={pending || atLimit}
            onChange={(roleIds) => onChange({ ...value, roleIds: roleIds.slice(0, MAX_ROLES) })}
            addLabel={atLimit ? 'Limite atteinte' : '+ Ajouter un rôle'}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {value.roleIds.length}/{MAX_ROLES} sélectionné{value.roleIds.length > 1 ? 's' : ''}
        </p>

        {orphanRoleIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <span className="flex-1">
              ⚠ {orphanRoleIds.length} rôle{orphanRoleIds.length > 1 ? 's' : ''} introuvable
              {orphanRoleIds.length > 1 ? 's' : ''} côté Discord (supprimé ou inaccessible). Le bot
              ne pourra pas l'attribuer — nettoie la liste.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handlePurgeOrphans}
              disabled={pending}
            >
              Nettoyer ({orphanRoleIds.length})
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="autorole-delay">
          Délai d'attribution
        </label>
        <Select
          id="autorole-delay"
          value={value.delaySeconds}
          onChange={(e) => onChange({ ...value, delaySeconds: Number(e.target.value) })}
          wrapperClassName="sm:w-64"
        >
          {DELAY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Un délai &gt; 0 laisse le temps au filtre comptes neufs et à la modération de s'appliquer
          avant l'attribution.
        </p>
      </div>
    </div>
  );
}
