'use client';

import { StickyActionBar } from '@varde/ui';
import { type ReactElement, type ReactNode, useMemo, useState, useTransition } from 'react';

import { useDirtyExitGuard } from '../../lib/hooks/useDirtyExitGuard';
import {
  saveWelcomeConfig,
  testWelcome,
  testWelcomeAutorole,
  type WelcomeConfigClient,
} from '../../lib/welcome-actions';
import { PreviewPanel } from './editor/PreviewPanel';
import { AdvancedConfigSection } from './sections/AdvancedConfigSection';
import { GoodbyeMessageSection } from './sections/GoodbyeMessageSection';
import { WelcomeMessageSection } from './sections/WelcomeMessageSection';
import { TemplatePicker } from './TemplatePicker';
import type { WelcomeTemplateClient } from './templates';
import type { ChannelOption, FeedbackBanner, RoleOption, WelcomeVariant } from './types';
import {
  evaluateWelcomeValidity,
  formatTestReason,
  isAdvancedConfig,
} from './welcome-config-helpers';

export interface WelcomeConfigEditorProps {
  readonly guildId: string;
  readonly initialConfig: WelcomeConfigClient;
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
  readonly availableFonts: readonly string[];
  /** Card "Statut du module" injectée par la page (server-rendered). */
  readonly statusCard: ReactNode;
}

/**
 * Shell orchestrateur du module welcome (refonte single-page,
 * progressive disclosure, style Logs / Reaction-roles). Détient le
 * state édité — config welcome complète — et affiche en cascade :
 *
 * 1. `statusCard` (statut module, version, toggle activation)
 * 2. `TemplatePicker` (CollapsibleSection, auto-ouverte si vierge)
 * 3. `WelcomeMessageSection` (Card + Toggle + MessageBlockEditor)
 * 4. `GoodbyeMessageSection` (idem)
 * 5. `AdvancedConfigSection` (CollapsibleSection : auto-rôle + filtre
 *     comptes neufs, auto-ouverte si déjà configuré)
 *
 * Colonne droite (sticky) : `PreviewPanel` qui rend le bloc actif
 * (welcome ou goodbye) via le `DiscordMessagePreview` générique. Un
 * toggle au-dessus permet de basculer l'aperçu.
 *
 * `StickyActionBar` en bas : Annuler / Enregistrer + `extra` 3
 * boutons « Tester » (accueil / départ / auto-rôle). Save désactivé
 * si une section activée est incomplète (channel manquant).
 *
 * Cancel restaure le snapshot initial complet. `useDirtyExitGuard`
 * pose le `beforeunload` natif tant que des modifs ne sont pas
 * sauvegardées.
 */
export function WelcomeConfigEditor({
  guildId,
  initialConfig,
  channels,
  roles,
  availableFonts,
  statusCard,
}: WelcomeConfigEditorProps): ReactElement {
  const [config, setConfig] = useState<WelcomeConfigClient>(initialConfig);
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [previewVariant, setPreviewVariant] = useState<WelcomeVariant>('welcome');
  const [pending, startTransition] = useTransition();

  // Snapshot pour Cancel + détection dirty.
  const initialSnapshot = useMemo(() => JSON.stringify(initialConfig), [initialConfig]);
  const currentSnapshot = JSON.stringify(config);
  const dirty = currentSnapshot !== initialSnapshot;

  useDirtyExitGuard(dirty);

  const validity = evaluateWelcomeValidity(config);

  const onCancel = (): void => {
    setConfig(initialConfig);
    setFeedback(null);
  };

  const onSave = (): void => {
    if (!validity.canSave) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await saveWelcomeConfig(guildId, config);
      if (result.ok) {
        setFeedback({
          kind: 'success',
          title: 'Sauvegardé',
          message: 'Configuration enregistrée.',
        });
      } else {
        const first = result.issues[0];
        setFeedback({
          kind: 'error',
          title: 'Échec de la sauvegarde',
          message: first
            ? `${first.path !== '' ? `${first.path} : ` : ''}${first.message}`
            : 'Erreur inconnue',
        });
      }
    });
  };

  const onTestMessage = (target: WelcomeVariant): void => {
    setFeedback(null);
    startTransition(async () => {
      const result = await testWelcome(guildId, config, target);
      if (result.ok) {
        setFeedback({
          kind: 'success',
          title: target === 'welcome' ? 'Accueil envoyé' : 'Départ envoyé',
          message: 'Vérifie le salon (et tes DMs si destination=both).',
        });
      } else {
        const base = formatTestReason(result.reason);
        const message =
          result.detail !== undefined && result.detail.length > 0
            ? `${base} (${result.detail})`
            : base;
        setFeedback({ kind: 'error', title: 'Échec du test', message });
      }
    });
  };

  const onTestAutorole = (): void => {
    setFeedback(null);
    startTransition(async () => {
      const result = await testWelcomeAutorole(guildId, config);
      if (result.ok) {
        setFeedback({
          kind: 'success',
          title: 'Auto-rôle appliqué',
          message: `${result.assigned.length} rôle(s) attribué(s) à ton compte. Vérifie côté Discord ; tu peux les retirer manuellement après vérification.`,
        });
      } else {
        const base = formatTestReason(result.reason);
        const message =
          result.detail !== undefined && result.detail.length > 0
            ? `${base} (${result.detail})`
            : base;
        setFeedback({ kind: 'error', title: 'Échec du test auto-rôle', message });
      }
    });
  };

  const onApplyTemplate = (template: WelcomeTemplateClient): void => {
    setConfig(template.config);
    setFeedback({
      kind: 'success',
      title: 'Modèle appliqué',
      message: `« ${template.label} » a remplacé la configuration courante. Pense à choisir le salon de destination.`,
    });
  };

  const templatesAutoOpen = config.welcome.message === '' && config.goodbye.message === '';
  const advancedAutoOpen = isAdvancedConfig(initialConfig);

  const previewBlock = previewVariant === 'goodbye' ? config.goodbye : config.welcome;

  const saveDisabledTitle = !validity.canSave
    ? 'Une section activée est incomplète : choisis un salon de destination ou désactive-la.'
    : undefined;

  const barDescription =
    feedback === null ? undefined : (
      <span className={feedback.kind === 'success' ? 'text-success' : 'text-destructive'}>
        <strong>{feedback.title}</strong>
        {feedback.message !== '' ? <> — {feedback.message}</> : null}
      </span>
    );

  const welcomeTestDisabled =
    pending ||
    !config.welcome.enabled ||
    (config.welcome.destination !== 'dm' && config.welcome.channelId === null);
  const goodbyeTestDisabled =
    pending || !config.goodbye.enabled || config.goodbye.channelId === null;
  const autoroleTestDisabled =
    pending || !config.autorole.enabled || config.autorole.roleIds.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {statusCard}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <TemplatePicker
            onApply={onApplyTemplate}
            autoOpen={templatesAutoOpen}
            storageKey={`varde:welcome:templates:${guildId}`}
          />

          <WelcomeMessageSection
            guildId={guildId}
            block={config.welcome}
            onChange={(welcome) => setConfig({ ...config, welcome })}
            channels={channels}
            availableFonts={availableFonts}
            pending={pending}
          />

          <GoodbyeMessageSection
            guildId={guildId}
            block={config.goodbye}
            onChange={(goodbye) => setConfig({ ...config, goodbye })}
            channels={channels}
            availableFonts={availableFonts}
            pending={pending}
          />

          <AdvancedConfigSection
            autorole={config.autorole}
            onAutoroleChange={(autorole) => setConfig({ ...config, autorole })}
            accountAgeFilter={config.accountAgeFilter}
            onAccountAgeFilterChange={(accountAgeFilter) =>
              setConfig({ ...config, accountAgeFilter })
            }
            roles={roles}
            storageKey={`varde:welcome:advanced:${guildId}`}
            autoOpen={advancedAutoOpen}
            pending={pending}
          />
        </div>

        <aside className="lg:col-span-2">
          <div className="sticky top-6 flex flex-col gap-3">
            <div
              role="tablist"
              aria-label="Bloc à prévisualiser"
              className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1"
            >
              <PreviewVariantTab
                icon="👋"
                label="Accueil"
                active={previewVariant === 'welcome'}
                onSelect={() => setPreviewVariant('welcome')}
                statusDot={config.welcome.enabled ? 'on' : 'off'}
              />
              <PreviewVariantTab
                icon="🚪"
                label="Départ"
                active={previewVariant === 'goodbye'}
                onSelect={() => setPreviewVariant('goodbye')}
                statusDot={config.goodbye.enabled ? 'on' : 'off'}
              />
            </div>
            {previewBlock.enabled ? (
              <PreviewPanel guildId={guildId} block={previewBlock} variant={previewVariant} />
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                Active la section{' '}
                {previewVariant === 'welcome' ? "« Message d'accueil »" : '« Message de départ »'}{' '}
                pour voir l'aperçu en live.
              </p>
            )}
          </div>
        </aside>
      </div>

      <StickyActionBar
        dirty={dirty}
        pending={pending}
        onCancel={onCancel}
        onSave={onSave}
        description={barDescription}
        saveDisabled={!validity.canSave}
        {...(saveDisabledTitle !== undefined ? { saveDisabledTitle } : {})}
        extra={
          <div className="flex flex-wrap gap-2">
            <TestButton
              disabled={welcomeTestDisabled}
              onClick={() => onTestMessage('welcome')}
              title={
                welcomeTestDisabled
                  ? "Active l'accueil et choisis un salon avant de tester."
                  : "Envoie le message d'accueil à ton compte."
              }
            >
              Tester accueil
            </TestButton>
            <TestButton
              disabled={goodbyeTestDisabled}
              onClick={() => onTestMessage('goodbye')}
              title={
                goodbyeTestDisabled
                  ? 'Active le départ et choisis un salon avant de tester.'
                  : 'Envoie le message de départ dans le salon configuré.'
              }
            >
              Tester départ
            </TestButton>
            <TestButton
              disabled={autoroleTestDisabled}
              onClick={onTestAutorole}
              title={
                autoroleTestDisabled
                  ? "Active l'auto-rôle avec au moins un rôle avant de tester."
                  : 'Applique les rôles auto à ton compte.'
              }
            >
              Tester auto-rôle
            </TestButton>
          </div>
        }
      />
    </div>
  );
}

interface PreviewVariantTabProps {
  readonly icon: string;
  readonly label: string;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly statusDot: 'on' | 'off';
}

function PreviewVariantTab({ icon, label, active, onSelect, statusDot }: PreviewVariantTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-100 ease-out ${
        active
          ? 'bg-surface-active text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`ml-0.5 h-1.5 w-1.5 rounded-full ${
          statusDot === 'on' ? 'bg-success' : 'bg-muted-foreground/40'
        }`}
      />
    </button>
  );
}

interface TestButtonProps {
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly title: string;
  readonly children: ReactNode;
}

function TestButton({ disabled, onClick, title, children }: TestButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
