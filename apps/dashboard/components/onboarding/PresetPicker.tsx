'use client';

import type { PresetDefinition } from '@varde/presets';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
} from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';

import { startOnboardingWithPreset } from '../../lib/onboarding-actions';
import { AIGenerator } from './AIGenerator';

export interface PresetPickerProps {
  readonly guildId: string;
  readonly presets: readonly PresetDefinition[];
}

/**
 * Étape 1 du flow : choix d'un preset de départ. Layout 2 colonnes —
 * main avec feature card IA + grille de presets, sidebar avec
 * avertissement 30 min + à propos.
 *
 * Au-dessus du catalogue, une feature card CTA « Générer un preset
 * sur mesure » expose un Textarea inline qui pré-remplit l'écran
 * `AIGenerator` au submit (PR 3.10).
 *
 * Au click sur un preset, on appelle la server action
 * `startOnboardingWithPreset` ; la page onboarding est ensuite
 * revalidée côté serveur et affiche l'étape suivante (BuilderCanvas).
 */
export function PresetPicker({ guildId, presets }: PresetPickerProps): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiDescription, setAiDescription] = useState('');
  const [showAi, setShowAi] = useState(false);

  if (showAi) {
    return (
      <AIGenerator
        guildId={guildId}
        onBack={() => setShowAi(false)}
        initialDescription={aiDescription}
      />
    );
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

  const onAiSubmit = (): void => {
    setShowAi(true);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <FeatureAiCard
          description={aiDescription}
          onChange={setAiDescription}
          onSubmit={onAiSubmit}
          disabled={pending}
        />

        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {presets.map((preset) => {
            const busy = pending && selectedId === preset.id;
            return (
              <li key={preset.id}>
                <PresetCard preset={preset} busy={busy} onChoose={onChoose} />
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="lg:col-span-1">
        <div className="sticky top-6 flex flex-col gap-4">
          <RollbackWarningCard />
          <AboutCard />
        </div>
      </aside>
    </div>
  );
}

// --- Feature CTA card (IA) ---

interface FeatureAiCardProps {
  readonly description: string;
  readonly onChange: (next: string) => void;
  readonly onSubmit: () => void;
  readonly disabled: boolean;
}

function FeatureAiCard({
  description,
  onChange,
  onSubmit,
  disabled,
}: FeatureAiCardProps): ReactElement {
  return (
    <Card className="overflow-hidden border-l-4 border-l-primary bg-linear-to-br from-primary/10 to-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 1.5l1.4 4.1L13.5 7l-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5z"
                fill="currentColor"
              />
            </svg>
          </span>
          <CardTitle>Générer un preset sur mesure avec l'IA</CardTitle>
        </div>
        <CardDescription>
          Décrivez votre communauté en quelques mots. L'IA propose un preset personnalisé que vous
          pourrez éditer puis appliquer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={description}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder='Ex : "Serveur gaming FPS, 50 membres, surtout du vocal le soir, besoin d&apos;un canal LFG."'
          aria-label="Description de la communauté"
        />
        <div className="flex justify-end">
          <Button type="button" onClick={onSubmit} disabled={disabled}>
            Générer →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Card de preset ---

interface PresetCardProps {
  readonly preset: PresetDefinition;
  readonly busy: boolean;
  readonly onChoose: (presetId: string) => void;
}

function PresetCard({ preset, busy, onChoose }: PresetCardProps): ReactElement {
  const meta = presetMeta(preset);
  return (
    <Card className="group flex h-full flex-col transition-colors duration-150 ease-out hover:border-primary/60">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-base"
            style={{ backgroundColor: meta.iconBg, color: meta.iconColor }}
          >
            {meta.icon}
          </span>
          <div className="flex flex-wrap justify-end gap-1">
            {preset.tags.slice(0, 3).map((tag) => (
              <PresetTag key={tag} tag={tag} />
            ))}
          </div>
        </div>
        <CardTitle className="text-base">{preset.name}</CardTitle>
        <CardDescription className="line-clamp-3">{preset.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 pt-0">
        <div className="grid grid-cols-4 gap-1 border-t border-border pt-3">
          <PresetStat value={preset.roles.length} label="rôles" />
          <PresetStat value={preset.categories.length} label="catégories" />
          <PresetStat value={preset.channels.length} label="salons" />
          <PresetStat value={preset.modules.length} label="modules" />
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => onChoose(preset.id)}
          aria-label={`Démarrer avec le preset ${preset.name}`}
        >
          {busy ? 'Démarrage…' : 'Démarrer →'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PresetStat({
  value,
  label,
}: {
  readonly value: number;
  readonly label: string;
}): ReactElement {
  return (
    <div className="flex flex-col text-center">
      <span className="text-lg font-bold leading-tight text-foreground">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

// --- Tags & metadata ---

interface TagStyle {
  readonly bg: string;
  readonly fg: string;
}

const TAG_PALETTE: Record<string, TagStyle> = {
  gaming: { bg: '#1a1a2e', fg: '#7289da' },
  voice: { bg: '#1a1a2e', fg: '#7289da' },
  tech: { bg: '#1a2233', fg: '#5b9bd5' },
  dev: { bg: '#1a2233', fg: '#5b9bd5' },
  ops: { bg: '#1a2233', fg: '#5b9bd5' },
  'text-only': { bg: '#1a2233', fg: '#5b9bd5' },
  creative: { bg: '#2a1a2e', fg: '#c27adb' },
  art: { bg: '#2a1a2e', fg: '#c27adb' },
  design: { bg: '#2a1a2e', fg: '#c27adb' },
  study: { bg: '#1a2e1a', fg: '#3ba55c' },
  education: { bg: '#1a2e1a', fg: '#3ba55c' },
  small: { bg: '#2b2d31', fg: '#80848e' },
  generic: { bg: '#2b2d31', fg: '#80848e' },
  starter: { bg: '#2b2d31', fg: '#80848e' },
  minimal: { bg: '#2b2d31', fg: '#80848e' },
};

const DEFAULT_TAG_STYLE: TagStyle = { bg: '#2b2d31', fg: '#80848e' };

function PresetTag({ tag }: { readonly tag: string }): ReactElement {
  const style = TAG_PALETTE[tag.toLowerCase()] ?? DEFAULT_TAG_STYLE;
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {tag}
    </span>
  );
}

interface PresetMeta {
  readonly icon: string;
  readonly iconBg: string;
  readonly iconColor: string;
}

function presetMeta(preset: PresetDefinition): PresetMeta {
  const tags = preset.tags.map((t) => t.toLowerCase());
  if (tags.some((t) => t === 'gaming' || t === 'voice')) {
    return { icon: '🎮', iconBg: '#1a1a2e', iconColor: '#7289da' };
  }
  if (tags.some((t) => t === 'tech' || t === 'dev' || t === 'ops')) {
    return { icon: '💻', iconBg: '#1a2233', iconColor: '#5b9bd5' };
  }
  if (tags.some((t) => t === 'creative' || t === 'art' || t === 'design')) {
    return { icon: '🎨', iconBg: '#2a1a2e', iconColor: '#c27adb' };
  }
  if (tags.some((t) => t === 'study' || t === 'education')) {
    return { icon: '📚', iconBg: '#1a2e1a', iconColor: '#3ba55c' };
  }
  return { icon: '✦', iconBg: '#2b2d31', iconColor: '#80848e' };
}

// --- Sidebar cards ---

function RollbackWarningCard(): ReactElement {
  return (
    <Card className="border-l-4 border-l-warning">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-warning">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8 4.5V8l2 1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <CardTitle className="text-sm">Annulation possible</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <p>
          Après application, vous disposez de{' '}
          <strong className="text-foreground">30 minutes</strong> pour défaire le preset (rollback
          intégral).
        </p>
        <p>Au-delà, les changements sont permanents et ne peuvent être annulés en un clic.</p>
      </CardContent>
    </Card>
  );
}

function AboutCard(): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">À propos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <p>Un preset crée :</p>
        <ul className="space-y-1 pl-4">
          <li>· des rôles Discord</li>
          <li>· des catégories et salons</li>
          <li>· active certains modules Varde</li>
        </ul>
        <p className="pt-1">
          Les salons et rôles existants ne sont pas supprimés — un preset n'ajoute que ce qui
          manque.
        </p>
      </CardContent>
    </Card>
  );
}
