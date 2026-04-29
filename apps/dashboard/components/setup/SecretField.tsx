'use client';

import type { ChangeEventHandler, ReactElement } from 'react';
import { useId, useState } from 'react';

/**
 * Champ password avec bascule afficher/masquer (étapes « Token bot »
 * et « OAuth » du wizard, jalon 7 PR 7.1). Volontairement client
 * component — l'état de visibilité ne sert qu'au rendu et ne traverse
 * jamais le serveur.
 *
 * L'avertissement « Ne partagez jamais ce token » est rendu en
 * sous-texte et restreint à un libellé optionnel — chaque étape
 * fournit son propre message contextuel.
 */

export interface SecretFieldProps {
  readonly name: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
  readonly autoComplete?: string;
  readonly showLabel?: string;
  readonly hideLabel?: string;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
}

export function SecretField({
  name,
  label,
  placeholder,
  hint,
  required = false,
  defaultValue,
  autoComplete = 'off',
  showLabel = 'Afficher',
  hideLabel = 'Masquer',
  onChange,
}: SecretFieldProps): ReactElement {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          required={required}
          autoComplete={autoComplete}
          spellCheck={false}
          {...(placeholder !== undefined ? { placeholder } : {})}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(onChange !== undefined ? { onChange } : {})}
          className="block w-full rounded-md border border-border-muted bg-background py-2 pl-3 pr-20 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1 top-1 inline-flex h-8 items-center rounded px-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-pressed={visible}
        >
          {visible ? hideLabel : showLabel}
        </button>
      </div>
      {hint !== undefined ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
