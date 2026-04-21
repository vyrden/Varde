'use client';

import type { PresetDefinition } from '@varde/presets';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';

import { startOnboardingWithPreset } from '../../lib/onboarding-actions';
import { AIGenerator } from './AIGenerator';

export interface PresetPickerProps {
  readonly guildId: string;
  readonly presets: readonly PresetDefinition[];
}

/**
 * Étape 1 du flow : choix d'un preset de départ. Les cartes affichent
 * un résumé chiffré (rôles / catégories / salons / modules) et la
 * description FR. Au click, on appelle la server action
 * `startOnboardingWithPreset` ; la page onboarding est ensuite
 * revalidée côté serveur et affiche l'étape suivante (BuilderCanvas).
 *
 * Au-dessus du catalogue, une CTA "Me générer un preset sur mesure
 * (IA)" bascule sur `AIGenerator` — flow parallèle qui appelle
 * `/onboarding/ai/generate-preset` puis crée la session avec
 * `source: 'ai'` si l'admin accepte la proposition (PR 3.10).
 */
export function PresetPicker({ guildId, presets }: PresetPickerProps): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);

  if (showAi) {
    return <AIGenerator guildId={guildId} onBack={() => setShowAi(false)} />;
  }

  const onChoose = (presetId: string): void => {
    setError(null);
    setSelectedId(presetId);
    startTransition(async () => {
      const result = await startOnboardingWithPreset(guildId, presetId);
      if (!result.ok) {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
        setSelectedId(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Choisir un preset de départ</h2>
        <p className="text-sm text-muted-foreground">
          Un preset est un squelette de serveur (rôles, catégories, salons, modules). Vous pourrez
          preview et appliquer, puis défaire si besoin dans les 30 minutes.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="space-y-1">
            <p className="text-sm font-medium">Pas de preset qui colle ?</p>
            <p className="text-xs text-muted-foreground">
              Décrivez votre communauté, l'IA propose un preset sur mesure que vous pourrez ensuite
              éditer et appliquer.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAi(true)}
            disabled={pending}
          >
            Me générer un preset sur mesure (IA)
          </Button>
        </CardContent>
      </Card>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {presets.map((preset) => {
          const busy = pending && selectedId === preset.id;
          return (
            <li key={preset.id}>
              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle>{preset.name}</CardTitle>
                  <CardDescription>{preset.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {preset.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <dl className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                    <PresetStat label="rôles" value={preset.roles.length} />
                    <PresetStat label="catégories" value={preset.categories.length} />
                    <PresetStat label="salons" value={preset.channels.length} />
                    <PresetStat label="modules" value={preset.modules.length} />
                  </dl>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => onChoose(preset.id)}
                    aria-label={`Démarrer avec le preset ${preset.name}`}
                  >
                    {busy ? 'Démarrage...' : 'Démarrer avec ce preset'}
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PresetStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): ReactElement {
  return (
    <div>
      <dt className="font-medium text-foreground">{value}</dt>
      <dd>{label}</dd>
    </div>
  );
}
