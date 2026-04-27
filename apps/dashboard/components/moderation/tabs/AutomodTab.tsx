'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import { AddRuleToolbar } from '../AddRuleToolbar';
import { RuleEditor } from '../RuleEditor';
import { blankAiClassify } from '../rule-blanks';
import type { AutomodRuleClient } from '../types';

export interface AutomodTabProps {
  readonly rules: readonly AutomodRuleClient[];
  readonly onRulesChange: (next: readonly AutomodRuleClient[]) => void;
  readonly pending: boolean;
}

/**
 * Tab « Automod » organisé en 2 sections claires :
 *
 * 1. **Modération par IA (recommandé)** — mise en avant en haut,
 *    onboarding direct. L'admin lambda crée une règle ai-classify
 *    en un clic, sans connaître les termes techniques.
 *
 * 2. **Règles manuelles (avancé)** — repliable, fermée par défaut
 *    si aucune règle manuelle n'est définie. Liste des règles
 *    existantes + AddRuleToolbar groupé par famille.
 *
 * Les règles ai-classify et manuelles partagent le même tableau
 * `rules` — leur séparation est purement présentationnelle.
 */
export function AutomodTab({ rules, onRulesChange, pending }: AutomodTabProps): ReactElement {
  const aiRules = rules.filter((r) => r.kind === 'ai-classify');
  const manualRules = rules.filter((r) => r.kind !== 'ai-classify');
  const [manualOpen, setManualOpen] = useState(manualRules.length > 0);

  const updateRule = (id: string, next: AutomodRuleClient): void => {
    onRulesChange(rules.map((r) => (r.id === id ? next : r)));
  };
  const removeRule = (id: string): void => {
    onRulesChange(rules.filter((r) => r.id !== id));
  };
  const addRule = (factory: () => AutomodRuleClient): void => {
    onRulesChange([...rules, factory()]);
  };

  return (
    <div className="space-y-6 py-4">
      {/* SECTION 1 — Modération par IA (recommandé) */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">
                Modération par IA{' '}
                <span className="ml-1 inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Recommandé
                </span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Le bot analyse chaque message avec un modèle d'IA et applique l'action si le contenu
                correspond à une des catégories cochées. Plus simple à configurer qu'une liste de
                mots — couvre toutes les langues automatiquement.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiRules.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                Aucune règle IA configurée. Active la classification IA pour démarrer la modération
                automatique.
              </p>
              <Button type="button" onClick={() => addRule(blankAiClassify)} disabled={pending}>
                + Activer la classification IA
              </Button>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {aiRules.map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded-lg border border-border bg-card/60 px-3.5 py-3 shadow-sm"
                  >
                    <RuleEditor
                      rule={rule}
                      pending={pending}
                      onChange={(next) => updateRule(rule.id, next)}
                      onRemove={() => removeRule(rule.id)}
                    />
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addRule(blankAiClassify)}
                disabled={pending}
              >
                + Ajouter une autre règle IA
              </Button>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            Le provider IA se configure dans <code>Paramètres → Fournisseur IA</code>. Sans
            provider, le bot retombe sur un stub minimal — pas de classification réelle.
          </p>
        </CardContent>
      </Card>

      {/* SECTION 2 — Règles manuelles (avancé) */}
      <Card>
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          aria-controls="moderation-manual-rules"
          className="flex w-full items-start justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-surface-active/30"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-foreground">Règles manuelles</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Avancé
              </span>
              {manualRules.length > 0 ? (
                <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">
                  {manualRules.length} règle{manualRules.length > 1 ? 's' : ''}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Compléments ou alternatives à l'IA. Évaluées en priorité quand elles matchent — moins
              coûteuses et déterministes.
            </p>
          </div>
          <span
            aria-hidden="true"
            className={`mt-1 shrink-0 transition-transform duration-150 ${manualOpen ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
        {manualOpen ? (
          <CardContent id="moderation-manual-rules" className="space-y-4 border-t border-border">
            {manualRules.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucune règle manuelle. Choisis un type ci-dessous pour créer ta première règle.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {manualRules.map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded-lg border border-border bg-card/60 px-3.5 py-3 shadow-sm"
                  >
                    <RuleEditor
                      rule={rule}
                      pending={pending}
                      onChange={(next) => updateRule(rule.id, next)}
                      onRemove={() => removeRule(rule.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <AddRuleToolbar pending={pending} onAdd={addRule} />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
