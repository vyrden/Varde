'use client';

import type { WelcomeConfigClient } from '../../lib/welcome-actions';

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface AccountAgeFilterSectionProps {
  readonly value: WelcomeConfigClient['accountAgeFilter'];
  readonly onChange: (next: WelcomeConfigClient['accountAgeFilter']) => void;
  readonly roles: readonly RoleOption[];
}

export function AccountAgeFilterSection({ value, onChange, roles }: AccountAgeFilterSectionProps) {
  // Activation gérée par le parent ExpandablePanel.
  if (!value.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Active le filtre pour configurer le seuil et l'action appliquée aux comptes trop neufs.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="filter-mindays">
          Seuil minimum : <span className="font-mono">{value.minDays}</span> jour
          {value.minDays > 1 ? 's' : ''}
        </label>
        <input
          id="filter-mindays"
          type="range"
          min={0}
          max={90}
          step={1}
          value={value.minDays}
          onChange={(e) => onChange({ ...value, minDays: Number(e.target.value) })}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Comptes plus jeunes que ce seuil → action ci-dessous appliquée à l'arrivée. 0 = filtre
          désactivé.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">Action</p>
        <div className="flex gap-2">
          {(
            [
              { value: 'kick', label: 'Kick', desc: 'Expulse le membre.' },
              {
                value: 'quarantine',
                label: 'Quarantaine',
                desc: 'Attribue un rôle restrictif.',
              },
            ] as const
          ).map((a) => (
            <label
              key={a.value}
              className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm ${
                value.action === a.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="filter-action"
                value={a.value}
                checked={value.action === a.value}
                onChange={() => onChange({ ...value, action: a.value })}
                className="sr-only"
              />
              <span className="font-medium">{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {value.minDays > 0 ? (
        <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100">
          <strong>Que se passera-t-il ?</strong> Un compte créé il y a moins de {value.minDays} jour
          {value.minDays > 1 ? 's' : ''}{' '}
          {value.action === 'kick'
            ? 'sera expulsé du serveur dès son arrivée (kick).'
            : 'recevra le rôle de quarantaine et l’auto-rôle normal sera ignoré.'}{' '}
          Il n’y a pas de bouton « Test » : la seule façon de vérifier en réel est qu’un compte
          fraîchement créé rejoigne le serveur. Tu peux retirer un membre kické en lui renvoyant une
          invitation, ou retirer le rôle de quarantaine côté Discord.
        </p>
      ) : null}

      {value.action === 'quarantine' ? (
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="filter-quarantine-role">
            Rôle de quarantaine
          </label>
          <select
            id="filter-quarantine-role"
            value={value.quarantineRoleId ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                quarantineRoleId: e.target.value === '' ? null : e.target.value,
              })
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— choisir un rôle —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Crée un rôle « Quarantaine » sans permissions et configure-le ici. L'auto-rôle normal
            n'est pas appliqué quand un membre est quarantiné.
          </p>
        </div>
      ) : null}
    </div>
  );
}
