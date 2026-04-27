'use client';

import { Toggle } from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';

import { setModuleEnabled } from '../lib/modules-actions';

export interface ModuleEnabledToggleProps {
  readonly guildId: string;
  readonly moduleId: string;
  readonly moduleName: string;
  readonly initialEnabled: boolean;
}

/**
 * Toggle interactif d'activation d'un module pour une guild. Bascule
 * optimiste : on flip la valeur tout de suite, on appelle la server
 * action, et en cas d'erreur on revert + alerte sous le toggle.
 *
 * Pattern : `<button role="switch">` via `<Toggle>` du DS, taille
 * Discord (40 × 22 px). Désactivé pendant le call HTTP.
 */
export function ModuleEnabledToggle({
  guildId,
  moduleId,
  moduleName,
  initialEnabled,
}: ModuleEnabledToggleProps): ReactElement {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onChange = (next: boolean): void => {
    if (pending) return;
    setError(null);
    const previous = enabled;
    setEnabled(next); // optimiste
    startTransition(async () => {
      const result = await setModuleEnabled(guildId, moduleId, next);
      if (!result.ok) {
        setEnabled(previous);
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    });
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <Toggle
        checked={enabled}
        onCheckedChange={onChange}
        disabled={pending}
        label={`${enabled ? 'Désactiver' : 'Activer'} ${moduleName}`}
      />
      {error !== null ? (
        <span role="alert" className="text-[10px] text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
