'use client';

import { Select } from '@varde/ui';

import type { WelcomeConfigClient } from '../../lib/welcome-actions';

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface AutoroleSectionProps {
  readonly value: WelcomeConfigClient['autorole'];
  readonly onChange: (next: WelcomeConfigClient['autorole']) => void;
  readonly roles: readonly RoleOption[];
}

const DELAY_OPTIONS = [
  { value: 0, label: 'Immédiat' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 3600, label: '1 heure' },
  { value: 86_400, label: '24 heures' },
];

export function AutoroleSection({ value, onChange, roles }: AutoroleSectionProps) {
  const toggleRole = (roleId: string) => {
    const set = new Set(value.roleIds);
    if (set.has(roleId)) set.delete(roleId);
    else set.add(roleId);
    onChange({ ...value, roleIds: Array.from(set) });
  };

  // Le parent (ExpandablePanel) gère l'activation : on n'affiche le
  // contenu que si activé, le toggle visuel est en haut du panneau.
  if (!value.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Active l'auto-rôle pour configurer les rôles attribués à l'arrivée.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Rôles à attribuer (max 10)</p>
        {roles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun rôle disponible. Crée des rôles dans Discord puis recharge la page.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => {
              const selected = value.roleIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  disabled={!selected && value.roleIds.length >= 10}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted-foreground/20'
                  } disabled:opacity-40`}
                >
                  {selected ? '✓ ' : ''}
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {value.roleIds.length}/10 sélectionné{value.roleIds.length > 1 ? 's' : ''}
        </p>
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
