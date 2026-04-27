'use client';

import { Button, Input, Select } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import type { AutomodRuleClient } from './types';

export interface LinksEditorProps {
  readonly rule: Extract<AutomodRuleClient, { kind: 'links' }>;
  readonly pending: boolean;
  readonly onChange: (next: AutomodRuleClient) => void;
}

/**
 * Sous-éditeur d'une règle `kind: 'links'`. Permet de basculer entre
 * « bloquer tous les liens » et « whitelist de domaines autorisés »,
 * et de gérer cette whitelist via chips (ajout / retrait). Les sous-
 * domaines sont autorisés automatiquement côté détection — pas besoin
 * de lister `*.github.com` séparément si `github.com` est listé.
 */
export function LinksEditor({ rule, pending, onChange }: LinksEditorProps): ReactElement {
  const [draft, setDraft] = useState('');
  const addDomain = (): void => {
    const trimmed = draft
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '');
    if (trimmed.length === 0) return;
    if (rule.whitelist.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange({ ...rule, whitelist: [...rule.whitelist, trimmed] });
    setDraft('');
  };
  const removeDomain = (d: string): void => {
    onChange({ ...rule, whitelist: rule.whitelist.filter((w) => w !== d) });
  };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`links-mode-${rule.id}`}
          className="text-[11px] font-medium text-muted-foreground"
        >
          Mode
        </label>
        <Select
          id={`links-mode-${rule.id}`}
          value={rule.mode}
          onChange={(e) => onChange({ ...rule, mode: e.target.value as 'block-all' | 'whitelist' })}
          wrapperClassName="w-44 shrink-0"
          disabled={pending}
        >
          <option value="block-all">Tout bloquer</option>
          <option value="whitelist">Whitelist (autoriser certains domaines)</option>
        </Select>
      </div>
      {rule.mode === 'whitelist' ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Domaines autorisés (sous-domaines compris). Ex : <code>github.com</code>,{' '}
            <code>youtube.com</code>.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rule.whitelist.length === 0 ? (
              <span className="text-[11px] italic text-muted-foreground">Aucun domaine</span>
            ) : (
              rule.whitelist.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-active px-2 py-0.5 text-xs"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => removeDomain(d)}
                    disabled={pending}
                    aria-label={`Retirer ${d}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDomain();
                }
              }}
              placeholder="exemple.com"
              className="max-w-xs"
              disabled={pending}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDomain}
              disabled={pending || draft.trim().length === 0}
            >
              Ajouter
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
