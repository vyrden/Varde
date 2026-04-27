'use client';

import { Button, CollapsibleSection } from '@varde/ui';
import type { ReactElement } from 'react';

import {
  renderTemplateClient,
  WELCOME_TEMPLATES_CLIENT,
  type WelcomeTemplateClient,
} from './templates';

export interface TemplatePickerProps {
  readonly onApply: (template: WelcomeTemplateClient) => void;
  /** Auto-ouvre la section au mount (config vierge). */
  readonly autoOpen: boolean;
  /** Persistance localStorage de l'état ouvert/fermé. */
  readonly storageKey: string;
}

/**
 * Variables d'exemple pour rendre le mini-aperçu inline de chaque
 * template. Mêmes données fictives que celles du `PreviewPanel`,
 * formatées spécifiquement pour `renderTemplateClient`.
 */
const SAMPLE_TEMPLATE_VARS = {
  user: 'Alice',
  userMention: '@Alice',
  userTag: 'alice',
  guild: 'Aperçu',
  memberCount: 42,
} as const;

/**
 * Section repliable « Partir d'un modèle » — affiche les 4 templates
 * pré-mâchés. Chaque carte montre un mini-aperçu du message d'accueil
 * (variables substituées) pour que l'admin choisisse à l'œil.
 *
 * Auto-ouverte si la config est vierge (premier accès au module).
 * Appliquer un template écrase la config puis referme la section.
 * Les salons et rôles spécifiques au serveur restent à renseigner.
 */
export function TemplatePicker({
  onApply,
  autoOpen,
  storageKey,
}: TemplatePickerProps): ReactElement {
  return (
    <CollapsibleSection
      title="Partir d'un modèle"
      subtitle="4 configurations pré-mâchées : applique-les puis ajuste les salons et rôles."
      defaultOpen={autoOpen}
      storageKey={storageKey}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {WELCOME_TEMPLATES_CLIENT.map((t) => {
          const previewMessage = renderTemplateClient(
            t.config.welcome.message,
            SAMPLE_TEMPLATE_VARS,
          );
          return (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface-active/30 p-3"
            >
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-2xl">
                  {t.icon}
                </span>
                <span className="text-sm font-medium text-foreground">{t.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t.description}</p>
              {previewMessage !== '' ? (
                <p className="line-clamp-3 rounded-md border border-border bg-background/60 px-2 py-1.5 text-[11px] italic text-foreground/80">
                  {previewMessage}
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onApply(t)}
                className="mt-auto"
              >
                Appliquer
              </Button>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
