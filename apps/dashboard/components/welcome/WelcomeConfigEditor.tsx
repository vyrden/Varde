'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ExpandablePanel,
  ReadonlySwitch,
} from '@varde/ui';
import { useState, useTransition } from 'react';

import {
  saveWelcomeConfig,
  testWelcome,
  testWelcomeAutorole,
  type WelcomeConfigClient,
} from '../../lib/welcome-actions';
import { AccountAgeFilterSection } from './AccountAgeFilterSection';
import { AutoroleSection } from './AutoroleSection';
import { DiscordMessagePreview } from './DiscordMessagePreview';
import { MessageBlockEditor } from './MessageBlockEditor';
import { TemplatePicker } from './TemplatePicker';
import type { WelcomeTemplateClient } from './templates';

interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface WelcomeConfigEditorProps {
  readonly guildId: string;
  readonly initialConfig: WelcomeConfigClient;
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
  readonly availableFonts: readonly string[];
  readonly moduleVersion: string;
  readonly isModuleEnabled: boolean;
}

interface FeedbackBanner {
  readonly kind: 'success' | 'error';
  readonly title: string;
  readonly message: string;
}

type ActiveTab = 'templates' | 'welcome' | 'goodbye';

const formatTestReason = (reason: string): string => {
  switch (reason) {
    case 'service-indisponible':
      return 'Le bot Discord est indisponible.';
    case 'welcome-désactivé':
      return "Active d'abord la section « Message d'accueil » avant de tester.";
    case 'goodbye-désactivé':
      return "Active d'abord la section « Message de départ » avant de tester.";
    case 'channel-requis':
      return 'Choisis un salon avant de tester.';
    case 'draft-invalide':
      return 'Le brouillon contient une erreur de validation.';
    case 'send-failed':
      return "L'envoi du message a échoué côté Discord.";
    case 'autorole-désactivé':
      return "Active l'auto-rôle avec au moins un rôle avant de tester.";
    case 'all-roles-failed':
      return 'Aucun rôle n’a pu être attribué (permissions / hiérarchie).';
    default:
      return reason.startsWith('http-') ? `Erreur HTTP ${reason.slice(5)}.` : `Erreur : ${reason}`;
  }
};

interface TabPillProps {
  readonly icon: string;
  readonly label: string;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly statusDot?: 'on' | 'off';
}

function TabPill({ icon, label, active, onSelect, statusDot }: TabPillProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-100 ease-out ${
        active
          ? 'bg-surface-active text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {statusDot ? (
        <span
          aria-hidden="true"
          className={`ml-0.5 h-1.5 w-1.5 rounded-full ${
            statusDot === 'on' ? 'bg-success' : 'bg-muted-foreground/40'
          }`}
        />
      ) : null}
    </button>
  );
}

/**
 * Éditeur welcome — layout 2 colonnes. Colonne gauche : navigation
 * (Templates / Accueil / Départ) + formulaire de l'onglet actif +
 * footer Tester/Sauvegarder. Colonne droite (sticky) : aperçu Discord
 * en live + cards À propos / Auto-rôle / Filtre comptes neufs.
 *
 * Les templates ne sont plus affichés en permanence : ils vivent dans
 * un onglet dédié. Sélectionner un template applique sa config et
 * bascule l'onglet actif sur « Accueil » pour aller éditer.
 */
export function WelcomeConfigEditor({
  guildId,
  initialConfig,
  channels,
  roles,
  availableFonts,
  moduleVersion,
  isModuleEnabled,
}: WelcomeConfigEditorProps) {
  const [config, setConfig] = useState<WelcomeConfigClient>(initialConfig);
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('welcome');
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
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

  const handleTestMessage = (target: 'welcome' | 'goodbye') => {
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

  const handleTestAutorole = () => {
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

  const handleApplyTemplate = (template: WelcomeTemplateClient) => {
    setConfig(template.config);
    setActiveTab('welcome');
  };

  // L'aperçu suit l'onglet actif. Sur l'onglet Templates, on montre
  // par défaut l'accueil — c'est ce que l'utilisateur ira éditer juste
  // après avoir choisi un template.
  const previewBlock = activeTab === 'goodbye' ? config.goodbye : config.welcome;
  const previewVariant: 'welcome' | 'goodbye' = activeTab === 'goodbye' ? 'goodbye' : 'welcome';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="flex flex-col gap-4 lg:col-span-3">
        <div
          role="tablist"
          aria-label="Sections du module welcome"
          className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1"
        >
          <TabPill
            icon="🎨"
            label="Templates"
            active={activeTab === 'templates'}
            onSelect={() => setActiveTab('templates')}
          />
          <TabPill
            icon="👋"
            label="Accueil"
            active={activeTab === 'welcome'}
            onSelect={() => setActiveTab('welcome')}
            statusDot={config.welcome.enabled ? 'on' : 'off'}
          />
          <TabPill
            icon="🚪"
            label="Départ"
            active={activeTab === 'goodbye'}
            onSelect={() => setActiveTab('goodbye')}
            statusDot={config.goodbye.enabled ? 'on' : 'off'}
          />
        </div>

        {activeTab === 'templates' ? <TemplatePicker onApply={handleApplyTemplate} /> : null}

        {activeTab === 'welcome' ? (
          <MessageBlockEditor
            title="Message d'accueil"
            block={config.welcome}
            onChange={(welcome) => setConfig({ ...config, welcome })}
            channels={channels}
            variant="welcome"
            guildId={guildId}
            availableFonts={availableFonts}
          />
        ) : null}

        {activeTab === 'goodbye' ? (
          <MessageBlockEditor
            title="Message de départ"
            block={config.goodbye}
            onChange={(goodbye) => setConfig({ ...config, goodbye })}
            channels={channels}
            variant="goodbye"
            guildId={guildId}
            availableFonts={availableFonts}
          />
        ) : null}

        {feedback !== null ? (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            className={
              feedback.kind === 'success'
                ? 'flex gap-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100'
                : 'flex gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100'
            }
          >
            <span aria-hidden="true" className="font-semibold">
              {feedback.kind === 'success' ? '✓' : '⚠'}
            </span>
            <div className="flex-1">
              <p className="font-semibold">{feedback.title}</p>
              <p className="mt-0.5">{feedback.message}</p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTestMessage('welcome')}
              disabled={pending || !config.welcome.enabled}
              title={!config.welcome.enabled ? "Active la section Message d'accueil" : undefined}
            >
              Tester accueil
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTestMessage('goodbye')}
              disabled={pending || !config.goodbye.enabled}
              title={!config.goodbye.enabled ? 'Active la section Message de départ' : undefined}
            >
              Tester départ
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestAutorole}
              disabled={pending || !config.autorole.enabled || config.autorole.roleIds.length === 0}
              title={
                !config.autorole.enabled || config.autorole.roleIds.length === 0
                  ? "Active l'auto-rôle avec au moins un rôle"
                  : undefined
              }
            >
              Tester auto-rôle
            </Button>
          </div>
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? 'Sauvegarde…' : 'Sauvegarder'}
          </Button>
        </div>
      </div>

      <aside className="lg:col-span-2">
        <div className="sticky top-6 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Aperçu Discord</CardTitle>
            </CardHeader>
            <CardContent>
              {previewBlock.enabled ? (
                <DiscordMessagePreview
                  guildId={guildId}
                  block={previewBlock}
                  variant={previewVariant}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Active la section{' '}
                  {previewVariant === 'welcome' ? "« Message d'accueil »" : '« Message de départ »'}{' '}
                  pour voir l'aperçu en live.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">À propos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono text-foreground">v{moduleVersion}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Statut</span>
                <div className="flex items-center gap-3">
                  <span className="text-foreground">{isModuleEnabled ? 'Actif' : 'Inactif'}</span>
                  <ReadonlySwitch enabled={isModuleEnabled} />
                </div>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Message d'accueil et de départ avec carte d'avatar, auto-rôle et filtre comptes
                neufs.
              </p>
            </CardContent>
          </Card>

          <ExpandablePanel
            title="Auto-rôle"
            description="Attribuer automatiquement un ou plusieurs rôles à l'arrivée."
            enabled={config.autorole.enabled}
            onEnabledChange={(enabled) =>
              setConfig({ ...config, autorole: { ...config.autorole, enabled } })
            }
          >
            <AutoroleSection
              value={config.autorole}
              onChange={(autorole) => setConfig({ ...config, autorole })}
              roles={roles}
            />
          </ExpandablePanel>

          <ExpandablePanel
            title="Filtre comptes neufs"
            description="Anti-raid basique : kick ou quarantaine pour les comptes Discord trop récents."
            enabled={config.accountAgeFilter.enabled}
            onEnabledChange={(enabled) =>
              setConfig({
                ...config,
                accountAgeFilter: { ...config.accountAgeFilter, enabled },
              })
            }
          >
            <AccountAgeFilterSection
              value={config.accountAgeFilter}
              onChange={(accountAgeFilter) => setConfig({ ...config, accountAgeFilter })}
              roles={roles}
            />
          </ExpandablePanel>
        </div>
      </aside>
    </div>
  );
}
