'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Progress,
  Select,
} from '@varde/ui';
import { type FormEvent, type ReactElement, useEffect, useState, useTransition } from 'react';

import { generatePresetWithAi, startOnboardingWithAiProposal } from '../../lib/onboarding-actions';
import type { GeneratedPresetDto } from '../../lib/onboarding-client';

export interface AIGeneratorProps {
  readonly guildId: string;
  readonly onBack: () => void;
}

interface DraftShape {
  readonly roles?: readonly unknown[];
  readonly categories?: readonly unknown[];
  readonly channels?: readonly unknown[];
  readonly modules?: readonly unknown[];
}

const countFrom = (preset: Readonly<Record<string, unknown>>, key: keyof DraftShape): number => {
  const v = preset[key];
  return Array.isArray(v) ? v.length : 0;
};

const nameOf = (preset: Readonly<Record<string, unknown>>): string => {
  const v = preset['name'];
  return typeof v === 'string' ? v : 'Preset IA';
};

const descriptionOf = (preset: Readonly<Record<string, unknown>>): string => {
  const v = preset['description'];
  return typeof v === 'string' ? v : '';
};

/**
 * Étape "Générer avec l'IA" (PR 3.10). Deux sous-états :
 *
 * 1. Saisie — textarea avec la description de la commu + locale.
 * 2. Proposition — carte résumée de ce que l'IA a produit, avec
 *    boutons "Utiliser ce preset" (crée la session) et "Régénérer"
 *    (retour à la saisie pour un nouvel essai).
 *
 * La description n'est pas stockée : elle sert uniquement à appeler
 * `/ai/generate-preset`. Seul le hash du prompt vit dans
 * `ai_invocations`, jamais le texte brut (ADR 0007 R5).
 */
// Timeout appliqué côté `AIService` (packages/ai/src/service.ts).
// On affiche une progress bar qui s'arrête à 95% pour ne jamais
// donner l'impression que c'est fini avant que le résultat arrive.
const AI_TIMEOUT_MS = 30_000;

export function AIGenerator({ guildId, onBack }: AIGeneratorProps): ReactElement {
  const [description, setDescription] = useState('');
  const [locale, setLocale] = useState<'fr' | 'en'>('fr');
  const [generating, setGenerating] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [proposal, setProposal] = useState<GeneratedPresetDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, startAccepting] = useTransition();

  useEffect(() => {
    if (!generating) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);
    return () => clearInterval(id);
  }, [generating]);

  const onGenerate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (description.trim().length === 0) {
      setError('Merci de décrire votre communauté en une ou deux phrases.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const result = await generatePresetWithAi(guildId, {
        description,
        locale,
        hints: [],
      });
      if (result.ok && result.data) {
        setProposal(result.data);
      } else {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const onAccept = (): void => {
    if (!proposal) return;
    setError(null);
    startAccepting(async () => {
      const result = await startOnboardingWithAiProposal(
        guildId,
        proposal.preset,
        proposal.invocationId,
      );
      if (!result.ok) {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    });
  };

  const onRegenerate = (): void => {
    setProposal(null);
    setError(null);
  };

  if (proposal) {
    const preset = proposal.preset;
    return (
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Proposition de l'IA</h2>
            <p className="text-sm text-muted-foreground">
              Provider : <span className="font-mono">{proposal.provider.id}</span> —{' '}
              <span className="font-mono">{proposal.provider.model}</span>. Vous pouvez accepter
              pour démarrer le builder, ou régénérer avec une description différente.
            </p>
          </div>
        </header>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{nameOf(preset)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {descriptionOf(preset) ? (
              <p className="text-muted-foreground">{descriptionOf(preset)}</p>
            ) : null}
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Pourquoi ce preset :</span>{' '}
              {proposal.rationale}
            </p>
            <dl className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
              <Stat value={countFrom(preset, 'roles')} label="rôles" />
              <Stat value={countFrom(preset, 'categories')} label="catégories" />
              <Stat value={countFrom(preset, 'channels')} label="salons" />
              <Stat value={countFrom(preset, 'modules')} label="modules" />
            </dl>
            <div>
              <Badge variant="secondary">confiance {Math.round(proposal.confidence * 100)}%</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={onAccept} disabled={accepting}>
            {accepting ? 'Création...' : 'Utiliser ce preset'}
          </Button>
          <Button type="button" variant="outline" onClick={onRegenerate} disabled={accepting}>
            Régénérer
          </Button>
          <Button type="button" variant="outline" onClick={onBack} disabled={accepting}>
            Retour aux presets
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onGenerate} className="space-y-4" aria-label="Générer un preset par IA">
      <div>
        <h2 className="text-lg font-semibold">Générer un preset sur mesure</h2>
        <p className="text-sm text-muted-foreground">
          Décrivez votre communauté en une ou deux phrases. L'IA proposera un preset à partir de
          cette description. Vous garderez la main sur l'étape suivante.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-description">Description de la communauté</Label>
        <textarea
          id="ai-description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Ex : petite commu de 50 devs fullstack, pas mal de partage de liens, peu de vocal, besoin d'un canal #help sous slowmode."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-locale">Langue des libellés générés</Label>
        <Select
          id="ai-locale"
          name="locale"
          value={locale}
          onChange={(e) => setLocale(e.target.value as 'fr' | 'en')}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </Select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {generating ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">L'IA réfléchit…</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.min(Math.round(elapsedMs / 1000), AI_TIMEOUT_MS / 1000)}s / ~
                {AI_TIMEOUT_MS / 1000}s
              </span>
            </div>
            <Progress
              value={Math.min(95, (elapsedMs / AI_TIMEOUT_MS) * 100)}
              label="génération IA en cours"
            />
            <p className="text-xs text-muted-foreground">
              Le délai dépend du provider : Ollama local répond souvent en 2 à 5 secondes, OpenAI
              gpt-4o-mini entre 5 et 15 secondes. La requête coupe à 30 secondes.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={generating}>
          {generating ? 'Génération…' : 'Générer'}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} disabled={generating}>
          Retour aux presets
        </Button>
      </div>
    </form>
  );
}

function Stat({ value, label }: { readonly value: number; readonly label: string }): ReactElement {
  return (
    <div>
      <dt className="font-medium text-foreground">{value}</dt>
      <dd>{label}</dd>
    </div>
  );
}
