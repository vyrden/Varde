'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import type { ReactElement } from 'react';

import type { EditorFeedback, EditorMode } from './editor-types';

interface ModeOption {
  readonly value: EditorMode;
  readonly label: string;
  readonly desc: string;
  readonly example: string;
}

const MODE_OPTIONS: ReadonlyArray<ModeOption> = [
  {
    value: 'normal',
    label: 'Normal',
    desc: 'Plusieurs rôles possibles, ajout/retrait libre.',
    example: 'Ex. rôles de notification — un membre peut suivre #annonces ET #events.',
  },
  {
    value: 'unique',
    label: 'Unique',
    desc: 'Un seul rôle à la fois (swap automatique).',
    example: 'Ex. continents — un membre est Européen OU Américain, pas les deux.',
  },
  {
    value: 'verifier',
    label: 'Vérificateur',
    desc: 'Pré-pensé pour la validation des règles.',
    example: 'Ex. acceptation des règles — un seul rôle, retiré si l’utilisateur réclique.',
  },
];

interface FeedbackOption {
  readonly value: EditorFeedback;
  readonly label: string;
  readonly hint: string;
}

const FEEDBACK_OPTIONS: ReadonlyArray<FeedbackOption> = [
  {
    value: 'dm',
    label: 'DM (message privé)',
    hint: "Pour les réactions et les boutons. Échoue silencieusement si l'utilisateur a fermé ses DMs.",
  },
  {
    value: 'ephemeral',
    label: 'Réponse éphémère',
    hint: 'Réservé aux clics sur boutons. « Seul toi peux voir » — n’apparaît dans aucun salon.',
  },
  {
    value: 'none',
    label: 'Aucun (silencieux)',
    hint: 'Le rôle est attribué sans confirmation visible.',
  },
];

export interface BehaviorSectionProps {
  readonly mode: EditorMode;
  readonly onModeChange: (next: EditorMode) => void;
  readonly feedbackChoice: EditorFeedback;
  readonly onFeedbackChange: (next: EditorFeedback) => void;
  /** Présence d'au moins un bouton dans la liste — affecte la validité de DM/éphémère. */
  readonly hasButton: boolean;
  readonly pending?: boolean;
}

/**
 * Card « Comportement » : 3 radio cards mode + 3 radio cards
 * confirmation. Chaque mode a son helper avec exemple concret. Le
 * feedback `ephemeral` est désactivé si aucun bouton n'est défini ;
 * un avertissement s'affiche si `dm` est choisi avec uniquement des
 * réactions (DM pas garanti — l'utilisateur peut avoir fermé ses
 * DMs sans le savoir).
 */
export function BehaviorSection({
  mode,
  onModeChange,
  feedbackChoice,
  onFeedbackChange,
  hasButton,
  pending = false,
}: BehaviorSectionProps): ReactElement {
  const ephemeralWithoutButton = feedbackChoice === 'ephemeral' && !hasButton;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comportement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Mode d'attribution</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODE_OPTIONS.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-sm transition-colors ${
                  mode === m.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                } ${pending ? 'pointer-events-none opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="rr-mode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => onModeChange(m.value)}
                    disabled={pending}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-medium text-foreground">{m.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{m.desc}</span>
                <span className="text-[11px] italic text-muted-foreground">{m.example}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            Confirmation à l'utilisateur
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {FEEDBACK_OPTIONS.map((f) => {
              const disabled = pending || (f.value === 'ephemeral' && !hasButton);
              return (
                <label
                  key={f.value}
                  className={`flex flex-col gap-1 rounded-lg border p-3 text-sm transition-colors ${
                    feedbackChoice === f.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  title={
                    f.value === 'ephemeral' && !hasButton
                      ? 'Ajoute au moins un bouton pour activer ce mode'
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="rr-feedback"
                      value={f.value}
                      checked={feedbackChoice === f.value}
                      onChange={() => !disabled && onFeedbackChange(f.value)}
                      disabled={disabled}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-medium text-foreground">{f.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{f.hint}</span>
                </label>
              );
            })}
          </div>
          {ephemeralWithoutButton ? (
            <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
              Le mode éphémère exige au moins un élément de type bouton.
            </p>
          ) : null}
          {feedbackChoice === 'dm' && !hasButton ? (
            <p className="text-[11px] text-muted-foreground">
              Astuce : si tu veux une confirmation garantie en cas de DMs fermés, ajoute un bouton
              et utilise le mode <em>Réponse éphémère</em>.
            </p>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}
