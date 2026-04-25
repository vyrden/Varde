'use client';

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

  return (
    <fieldset className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <legend className="px-2 text-sm font-semibold">Auto-rôle</legend>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Attribuer automatiquement un ou plusieurs rôles à l'arrivée
      </label>

      {value.enabled ? (
        <>
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
            <select
              id="autorole-delay"
              value={value.delaySeconds}
              onChange={(e) => onChange({ ...value, delaySeconds: Number(e.target.value) })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-64"
            >
              {DELAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Un délai &gt; 0 laisse le temps au filtre comptes neufs et à la modération de
              s'appliquer avant l'attribution.
            </p>
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
