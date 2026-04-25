'use client';

import { Button } from '@varde/ui';
import { useState, useTransition } from 'react';

import {
  saveWelcomeConfig,
  testWelcome,
  type WelcomeConfigClient,
} from '../../lib/welcome-actions';
import { AccountAgeFilterSection } from './AccountAgeFilterSection';
import { AutoroleSection } from './AutoroleSection';
import { DiscordMessagePreview } from './DiscordMessagePreview';
import { MessageBlockEditor } from './MessageBlockEditor';
import { TemplatePicker } from './TemplatePicker';

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
}

interface FeedbackBanner {
  readonly kind: 'success' | 'error';
  readonly title: string;
  readonly message: string;
}

const formatTestReason = (reason: string): string => {
  switch (reason) {
    case 'service-indisponible':
      return 'Le bot Discord est indisponible.';
    case 'welcome-désactivé':
      return "Active d'abord la section « Message d'accueil » avant de tester.";
    case 'channel-requis':
      return 'Choisis un salon avant de tester.';
    case 'draft-invalide':
      return 'Le brouillon contient une erreur de validation.';
    case 'send-failed':
      return "L'envoi du message a échoué côté Discord.";
    default:
      return reason.startsWith('http-') ? `Erreur HTTP ${reason.slice(5)}.` : `Erreur : ${reason}`;
  }
};

export function WelcomeConfigEditor({
  guildId,
  initialConfig,
  channels,
  roles,
}: WelcomeConfigEditorProps) {
  const [config, setConfig] = useState<WelcomeConfigClient>(initialConfig);
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [activeTab, setActiveTab] = useState<'welcome' | 'goodbye'>('welcome');
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

  const handleTest = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await testWelcome(guildId, config);
      if (result.ok) {
        setFeedback({
          kind: 'success',
          title: 'Test envoyé',
          message: 'Vérifie le salon ou tes DMs Discord.',
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

  return (
    <div className="space-y-6">
      <TemplatePicker onApply={(t) => setConfig(t.config)} />

      {/* Tabs Accueil / Départ */}
      <div
        role="tablist"
        aria-label="Messages welcome et goodbye"
        className="flex gap-2 border-b border-border"
      >
        {(
          [
            { id: 'welcome', label: "Message d'accueil", enabled: config.welcome.enabled },
            { id: 'goodbye', label: 'Message de départ', enabled: config.goodbye.enabled },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              {t.label}
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${
                  t.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                }`}
              />
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'welcome' ? (
        <>
          <MessageBlockEditor
            title="Message d'accueil"
            block={config.welcome}
            onChange={(welcome) => setConfig({ ...config, welcome })}
            channels={channels}
            variant="welcome"
            guildId={guildId}
          />
          {config.welcome.enabled ? (
            <DiscordMessagePreview guildId={guildId} block={config.welcome} variant="welcome" />
          ) : null}
        </>
      ) : (
        <>
          <MessageBlockEditor
            title="Message de départ"
            block={config.goodbye}
            onChange={(goodbye) => setConfig({ ...config, goodbye })}
            channels={channels}
            variant="goodbye"
            guildId={guildId}
          />
          {config.goodbye.enabled ? (
            <DiscordMessagePreview guildId={guildId} block={config.goodbye} variant="goodbye" />
          ) : null}
        </>
      )}

      <AutoroleSection
        value={config.autorole}
        onChange={(autorole) => setConfig({ ...config, autorole })}
        roles={roles}
      />

      <AccountAgeFilterSection
        value={config.accountAgeFilter}
        onChange={(accountAgeFilter) => setConfig({ ...config, accountAgeFilter })}
        roles={roles}
      />

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

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={handleTest} disabled={pending}>
          {pending ? '…' : 'Tester (envoie un message)'}
        </Button>
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  );
}
