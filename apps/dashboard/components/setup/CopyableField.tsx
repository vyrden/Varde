'use client';

import type { ReactElement } from 'react';
import { useId, useState } from 'react';

/**
 * Champ readonly avec bouton « Copier » à droite (étape OAuth du
 * wizard, jalon 7 PR 7.1). Sert à afficher l'URI de redirection
 * Discord que l'admin doit coller dans le portail Developer —
 * fournir un bouton copier évite les fautes de frappe sur 60+ chars.
 *
 * Volontairement client component : `navigator.clipboard.writeText`
 * n'est dispo que côté navigateur. L'état `copied` ne sert qu'au
 * feedback visuel (« Copié ! ») et ne traverse pas le serveur.
 */

export interface CopyableFieldProps {
  readonly label: string;
  readonly value: string;
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
  readonly hint?: string;
}

export function CopyableField({
  label,
  value,
  copyLabel = 'Copier',
  copiedLabel = 'Copié !',
  hint,
}: CopyableFieldProps): ReactElement {
  const id = useId();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pas d'accès au clipboard (HTTP non sécurisé, permissions
      // refusées) — on garde le bouton inerte plutôt que de polluer
      // l'UI. L'admin peut sélectionner manuellement le texte.
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          readOnly
          value={value}
          className="block w-full rounded-md border border-border-muted bg-background py-2 pl-3 pr-24 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-1 top-1 inline-flex h-8 items-center rounded px-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      {hint !== undefined ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
