'use client';

import type { ReactElement } from 'react';

import {
  ACTION_DESCRIPTION,
  ACTION_DOT,
  ACTION_LABEL,
  ACTION_ORDER,
  normalizeActions,
} from './rule-meta';
import type { AutomodActionClient } from './types';

export interface ActionsPickerProps {
  readonly actions: ReadonlyArray<AutomodActionClient>;
  readonly pending: boolean;
  readonly onChange: (next: ReadonlyArray<AutomodActionClient>) => void;
}

/**
 * Multi-sélection compacte des actions (Delete / Warn / Mute) :
 * chaque action est une chip cliquable. Au moins une doit rester
 * active — un clic qui retirerait la dernière action est ignoré
 * (le bouton est désactivé visuellement).
 */
export function ActionsPicker({ actions, pending, onChange }: ActionsPickerProps): ReactElement {
  const toggle = (action: AutomodActionClient): void => {
    const has = actions.includes(action);
    if (has && actions.length === 1) return; // garde au moins une action
    const next = has ? actions.filter((a) => a !== action) : [...actions, action];
    onChange(normalizeActions(next));
  };
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-base p-0.5">
      {ACTION_ORDER.map((action) => {
        const active = actions.includes(action);
        const isLast = active && actions.length === 1;
        return (
          <button
            key={action}
            type="button"
            onClick={() => toggle(action)}
            disabled={pending || isLast}
            aria-pressed={active}
            title={`${ACTION_LABEL[action]} — ${ACTION_DESCRIPTION[action]}${
              isLast ? ' (au moins une action requise)' : ''
            }`}
            className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-surface-active hover:text-foreground'
            } ${isLast ? 'cursor-not-allowed' : ''}`}
          >
            <span aria-hidden="true" className={`size-2 rounded-full ${ACTION_DOT[action]}`} />
            {ACTION_LABEL[action]}
          </button>
        );
      })}
    </div>
  );
}
