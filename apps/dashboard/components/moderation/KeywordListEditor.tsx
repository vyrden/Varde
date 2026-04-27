'use client';

import { Button, Input, Select } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import { AI_CATEGORY_LABEL, KEYWORD_LANGUAGE_LABEL } from './rule-meta';
import type { AiCategoryClient, AutomodRuleClient, KeywordListLanguageClient } from './types';

export interface KeywordListEditorProps {
  readonly rule: Extract<AutomodRuleClient, { kind: 'keyword-list' }>;
  readonly pending: boolean;
  readonly onChange: (next: AutomodRuleClient) => void;
}

/**
 * Sous-éditeur de la règle `keyword-list`. Trois contrôles :
 * - langue du vocabulaire seedé (FR / EN / FR + EN) ;
 * - catégories surveillées (toxicity, harassment, etc.) ;
 * - mots additionnels custom — étendent le vocab, persistés en
 *   config, matchent en accent-insensitive case-insensitive.
 */
export function KeywordListEditor({
  rule,
  pending,
  onChange,
}: KeywordListEditorProps): ReactElement {
  const [draft, setDraft] = useState('');
  const addCustom = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || rule.customWords.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange({ ...rule, customWords: [...rule.customWords, trimmed] });
    setDraft('');
  };
  const removeCustom = (w: string): void => {
    onChange({ ...rule, customWords: rule.customWords.filter((cw) => cw !== w) });
  };
  const toggleCategory = (cat: AiCategoryClient): void => {
    const has = rule.categories.includes(cat);
    onChange({
      ...rule,
      categories: has ? rule.categories.filter((c) => c !== cat) : [...rule.categories, cat],
    });
  };
  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`kl-lang-${rule.id}`}
          className="text-[11px] font-medium text-muted-foreground"
        >
          Langue du vocabulaire
        </label>
        <Select
          id={`kl-lang-${rule.id}`}
          value={rule.language}
          onChange={(e) =>
            onChange({ ...rule, language: e.target.value as KeywordListLanguageClient })
          }
          wrapperClassName="w-44 shrink-0"
          disabled={pending}
        >
          {(Object.keys(KEYWORD_LANGUAGE_LABEL) as KeywordListLanguageClient[]).map((lang) => (
            <option key={lang} value={lang}>
              {KEYWORD_LANGUAGE_LABEL[lang]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">
          Catégories surveillées (au moins une)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(AI_CATEGORY_LABEL) as AiCategoryClient[]).map((cat) => {
            const active = rule.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                disabled={pending}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  active
                    ? 'bg-info/15 text-foreground'
                    : 'bg-surface-active text-muted-foreground hover:text-foreground'
                }`}
              >
                {AI_CATEGORY_LABEL[cat]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">
          Mots additionnels custom (substring case + accent insensible)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {rule.customWords.length === 0 ? (
            <span className="text-[11px] italic text-muted-foreground">Aucun mot custom</span>
          ) : (
            rule.customWords.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1 rounded-md bg-surface-active px-2 py-0.5 text-xs"
              >
                {w}
                <button
                  type="button"
                  onClick={() => removeCustom(w)}
                  disabled={pending}
                  aria-label={`Retirer ${w}`}
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
                addCustom();
              }
            }}
            placeholder="mot ou phrase"
            className="max-w-xs"
            disabled={pending}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCustom}
            disabled={pending || draft.trim().length === 0}
          >
            Ajouter
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Le vocabulaire complet (seedé FR/EN + custom) est inspectable côté admin pour transparence
          — alternative déterministe à la classification IA.
        </p>
      </div>
    </div>
  );
}
