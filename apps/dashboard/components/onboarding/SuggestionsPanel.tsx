'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label } from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';

import { patchOnboardingDraft, suggestOnboardingCompletion } from '../../lib/onboarding-actions';
import type {
  OnboardingSessionDto,
  SuggestionDto,
  SuggestionKind,
} from '../../lib/onboarding-client';

export interface SuggestionsPanelProps {
  readonly session: OnboardingSessionDto;
}

const KIND_LABELS: Record<SuggestionKind, string> = {
  role: 'rôle',
  category: 'catégorie',
  channel: 'salon',
};

const KIND_ARRAY_KEYS: Record<SuggestionKind, 'roles' | 'categories' | 'channels'> = {
  role: 'roles',
  category: 'categories',
  channel: 'channels',
};

/**
 * Concatène le fragment `patch` d'une suggestion avec les arrays du
 * draft courant et renvoie un patch à envoyer à `PATCH /draft`. On
 * merge côté client parce que le `deepMerge` côté API remplace les
 * arrays — sans ce pré-traitement, accepter une suggestion
 * écraserait les rôles / catégories / salons déjà définis.
 */
const buildDraftPatch = (
  session: OnboardingSessionDto,
  suggestion: SuggestionDto,
): Readonly<Record<string, unknown>> => {
  const out: Record<string, unknown> = {};
  for (const key of ['roles', 'categories', 'channels'] as const) {
    const incoming = suggestion.patch[key];
    if (!Array.isArray(incoming)) continue;
    const current = session.draft[key] as readonly unknown[];
    out[key] = [...current, ...incoming];
  }
  return out;
};

/**
 * Panneau de suggestions contextuelles (PR 3.11). Permet à l'admin
 * de demander à l'IA 1 ou 2 entrées pour compléter son draft
 * (rôle, catégorie ou salon). Chaque suggestion est présentée avec
 * un rationale court et un bouton "Ajouter à mon draft" — l'IA
 * n'applique jamais elle-même (ADR 0007 R1).
 *
 * Ne se rend que tant que la session est éditable (`status === 'draft'`).
 * Les erreurs API (404 si l'IA n'est pas configurée côté server,
 * 502 si le provider casse) sont affichées inline et n'interrompent
 * pas l'UI du builder.
 */
export function SuggestionsPanel({ session }: SuggestionsPanelProps): ReactElement | null {
  const [activeKind, setActiveKind] = useState<SuggestionKind | null>(null);
  const [hint, setHint] = useState('');
  const [suggestions, setSuggestions] = useState<readonly SuggestionDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addingLabel, setAddingLabel] = useState<string | null>(null);
  const [addingTransition, startAddingTransition] = useTransition();

  if (session.status !== 'draft') return null;

  const onAsk = async (kind: SuggestionKind): Promise<void> => {
    setActiveKind(kind);
    setSuggestions([]);
    setError(null);
    setLoading(true);
    try {
      const result = await suggestOnboardingCompletion(
        session.guildId,
        kind,
        session.draft as unknown as Readonly<Record<string, unknown>>,
        hint,
      );
      if (result.ok && result.data) {
        setSuggestions(result.data.suggestions);
      } else {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    } finally {
      setLoading(false);
    }
  };

  const onAdd = (suggestion: SuggestionDto): void => {
    setError(null);
    setAddingLabel(suggestion.label);
    startAddingTransition(async () => {
      try {
        const patch = buildDraftPatch(session, suggestion);
        const result = await patchOnboardingDraft(session.guildId, session.id, patch);
        if (!result.ok) {
          setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
          return;
        }
        setSuggestions((prev) => prev.filter((s) => s.label !== suggestion.label));
      } finally {
        setAddingLabel(null);
      }
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Suggestions IA</CardTitle>
        <p className="text-sm text-muted-foreground">
          Demandez à l'IA de proposer un rôle, une catégorie ou un salon complémentaire. Vous
          décidez ce qui est ajouté à votre draft.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="suggest-hint">Indication (optionnel)</Label>
          <input
            id="suggest-hint"
            name="hint"
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Ex : un rôle pour les contributeurs actifs."
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_LABELS) as SuggestionKind[]).map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              onClick={() => void onAsk(kind)}
              disabled={loading || addingTransition}
              aria-label={`Suggérer un ${KIND_LABELS[kind]}`}
            >
              {loading && activeKind === kind ? 'Recherche...' : `Suggérer un ${KIND_LABELS[kind]}`}
            </Button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {suggestions.length > 0 ? (
          <ul className="space-y-3">
            {suggestions.map((suggestion) => {
              const arrayKey = activeKind ? KIND_ARRAY_KEYS[activeKind] : null;
              const count = arrayKey
                ? Array.isArray(suggestion.patch[arrayKey])
                  ? (suggestion.patch[arrayKey] as readonly unknown[]).length
                  : 0
                : 0;
              const busy = addingTransition && addingLabel === suggestion.label;
              return (
                <li
                  key={suggestion.label}
                  className="rounded-md border border-border p-3 text-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="font-medium">{suggestion.label}</strong>
                    {count > 0 ? <Badge variant="secondary">+{count} entrée(s)</Badge> : null}
                  </div>
                  <p className="text-muted-foreground">{suggestion.rationale}</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onAdd(suggestion)}
                    disabled={addingTransition}
                  >
                    {busy ? 'Ajout...' : 'Ajouter à mon draft'}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
