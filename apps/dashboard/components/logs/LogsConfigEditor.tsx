'use client';

import { StickyActionBar } from '@varde/ui';
import { type ReactElement, type ReactNode, useMemo, useState, useTransition } from 'react';

import type { LogsBrokenRoute } from '../../lib/api-client';
import { saveLogsConfig, testLogsRoute } from '../../lib/logs-actions';
import { AdvancedConfigSection } from './AdvancedConfigSection';
import { BrokenRoutesBanner } from './BrokenRoutesBanner';
import { DestinationChannelSection } from './DestinationChannelSection';
import { EventsSection } from './EventsSection';
import {
  additionalRoutes,
  buildRoutesForSave,
  countRedirectedEvents,
  extractSimpleRoute,
  isAdvancedConfig,
} from './logs-config-helpers';
import { OnboardingHint } from './OnboardingHint';
import { OptionsSection } from './OptionsSection';

/** Types clients miroirs de la config (le vrai schéma Zod vit dans modules/logs). */
export interface LogsConfigClient {
  readonly version: 1;
  readonly routes: readonly LogsRouteClient[];
  readonly exclusions: LogsExclusionsClient;
}

export interface LogsRouteClient {
  readonly id: string;
  readonly label: string;
  readonly events: readonly string[];
  readonly channelId: string;
  readonly verbosity: 'compact' | 'detailed';
}

export interface LogsExclusionsClient {
  readonly userIds: readonly string[];
  readonly roleIds: readonly string[];
  readonly channelIds: readonly string[];
  readonly excludeBots: boolean;
}

export interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface LogsConfigEditorProps {
  readonly guildId: string;
  readonly initialConfig: LogsConfigClient;
  readonly brokenRoutes: readonly LogsBrokenRoute[];
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
  /** Card "Statut du module" injectée par la page (server-rendered). */
  readonly statusCard: ReactNode;
}

/**
 * Shell orchestrateur de la page Logs (refonte single-page,
 * progressive disclosure). Détient le state édité — channelId et
 * events surveillés (vue simple), routes additionnelles + exclusions
 * (vue avancée). Affiche en cascade :
 *
 * 1. `BrokenRoutesBanner` (si routes cassées)
 * 2. `statusCard` (statut module, version, toggle activation —
 *     parallèle au pattern Moderation)
 * 3. `OnboardingHint` (si config vierge : pas de salon, pas d'event)
 * 4. `DestinationChannelSection`
 * 5. `EventsSection`
 * 6. `OptionsSection`
 * 7. `AdvancedConfigSection` (replié par défaut, ouvert si config
 *     déjà avancée existe au mount)
 *
 * `StickyActionBar` en bas : Annuler / Enregistrer + `extra` "Tester"
 * sur le salon de destination courant. Bouton Save désactivé tant
 * qu'aucun salon n'est sélectionné (impossible de persister une
 * config inerte).
 *
 * Save flow : reconstruit `routes` via `buildRoutesForSave` qui
 * upsert la simple-route (vue simple) et préserve les routes
 * additionnelles. Cancel restaure l'état initial complet.
 */
export function LogsConfigEditor({
  guildId,
  initialConfig,
  brokenRoutes,
  channels,
  roles,
  statusCard,
}: LogsConfigEditorProps): ReactElement {
  // ─── State édité ─────────────────────────────────────────────────
  const initialSimple = useMemo(() => extractSimpleRoute(initialConfig), [initialConfig]);
  const initialAdditionalRoutes = useMemo(
    () => additionalRoutes(initialConfig.routes),
    [initialConfig.routes],
  );

  const [channelId, setChannelId] = useState<string>(initialSimple?.channelId ?? '');
  const [selectedEventIds, setSelectedEventIds] = useState<ReadonlySet<string>>(
    () => new Set(initialSimple?.events ?? []),
  );
  const [excludeBots, setExcludeBots] = useState<boolean>(initialConfig.exclusions.excludeBots);
  const [advancedRoutes, setAdvancedRoutes] =
    useState<readonly LogsRouteClient[]>(initialAdditionalRoutes);
  const [exclusions, setExclusions] = useState<LogsExclusionsClient>(initialConfig.exclusions);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Snapshot pour Cancel + détection dirty.
  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        channelId: initialSimple?.channelId ?? '',
        eventIds: [...(initialSimple?.events ?? [])].sort(),
        excludeBots: initialConfig.exclusions.excludeBots,
        additionalRoutes: initialAdditionalRoutes,
        exclusions: initialConfig.exclusions,
      }),
    [initialSimple, initialConfig.exclusions, initialAdditionalRoutes],
  );

  const currentSnapshot = JSON.stringify({
    channelId,
    eventIds: Array.from(selectedEventIds).sort(),
    excludeBots,
    additionalRoutes: advancedRoutes,
    exclusions,
  });

  const dirty = currentSnapshot !== initialSnapshot;

  // L'état `excludeBots` est miroité entre la card Options (simple)
  // et la sous-section Filtres (avancé). On synchronise dans les
  // deux sens : la simple écrit dans `excludeBots` ; le shell réécrit
  // ça dans `exclusions.excludeBots` au moment du save.
  const exclusionsForSave: LogsExclusionsClient = { ...exclusions, excludeBots };

  const onCancel = (): void => {
    setChannelId(initialSimple?.channelId ?? '');
    setSelectedEventIds(new Set(initialSimple?.events ?? []));
    setExcludeBots(initialConfig.exclusions.excludeBots);
    setAdvancedRoutes(initialAdditionalRoutes);
    setExclusions(initialConfig.exclusions);
    setFeedback(null);
  };

  const onSave = (): void => {
    if (channelId === '') return;
    setFeedback(null);
    startTransition(async () => {
      const allRoutes = buildRoutesForSave(advancedRoutes, channelId, Array.from(selectedEventIds));
      const payload: LogsConfigClient = {
        version: 1,
        routes: allRoutes,
        exclusions: exclusionsForSave,
      };
      const result = await saveLogsConfig(guildId, payload);
      if (result.ok) {
        setFeedback({ kind: 'success', message: 'Configuration enregistrée.' });
      } else {
        setFeedback({
          kind: 'error',
          message: result.issues[0]?.message ?? 'Erreur inconnue',
        });
      }
    });
  };

  const onTest = (): void => {
    if (channelId === '') return;
    setFeedback(null);
    startTransition(async () => {
      const result = await testLogsRoute(guildId, channelId);
      if (result.ok) {
        setFeedback({ kind: 'success', message: 'Test envoyé : va vérifier dans le salon.' });
      } else {
        setFeedback({
          kind: 'error',
          message: `Échec du test : ${formatTestReason(result.reason)}`,
        });
      }
    });
  };

  const showOnboardingHint = channelId === '' && selectedEventIds.size === 0;
  const advancedAutoOpen = isAdvancedConfig(initialConfig);
  const redirectedEvents = countRedirectedEvents(advancedRoutes);

  const barDescription =
    feedback?.kind === 'success' ? (
      <span className="text-success">{feedback.message}</span>
    ) : feedback?.kind === 'error' ? (
      <span className="text-destructive">{feedback.message}</span>
    ) : undefined;

  const noChannel = channelId === '';

  return (
    <div className="flex flex-col gap-5">
      <BrokenRoutesBanner guildId={guildId} brokenRoutes={brokenRoutes} />
      {statusCard}
      {showOnboardingHint ? <OnboardingHint /> : null}

      <DestinationChannelSection
        guildId={guildId}
        channelId={channelId}
        onChannelChange={setChannelId}
        channels={channels}
        redirectedEventsCount={redirectedEvents}
        pending={pending}
        onFeedback={setFeedback}
      />

      <EventsSection
        selectedEventIds={selectedEventIds}
        onSelectedEventIdsChange={setSelectedEventIds}
        pending={pending}
      />

      <OptionsSection
        excludeBots={excludeBots}
        onExcludeBotsChange={setExcludeBots}
        pending={pending}
      />

      <AdvancedConfigSection
        guildId={guildId}
        routes={advancedRoutes}
        onRoutesChange={setAdvancedRoutes}
        exclusions={exclusionsForSave}
        onExclusionsChange={(next) => {
          // Garde la cohérence : `excludeBots` reste piloté par la
          // section Options. Si l'admin le change ici, on miroite.
          setExclusions({
            userIds: next.userIds,
            roleIds: next.roleIds,
            channelIds: next.channelIds,
            excludeBots: next.excludeBots,
          });
          setExcludeBots(next.excludeBots);
        }}
        channels={channels}
        roles={roles}
        storageKey={`varde:logs:advanced:${guildId}`}
        autoOpen={advancedAutoOpen}
        pending={pending}
        onFeedback={setFeedback}
      />

      <StickyActionBar
        dirty={dirty}
        pending={pending}
        onCancel={onCancel}
        onSave={onSave}
        description={barDescription}
        saveDisabled={noChannel}
        saveDisabledTitle="Sélectionne d’abord un salon de destination."
        extra={
          <button
            type="button"
            onClick={onTest}
            disabled={pending || noChannel}
            title={
              noChannel
                ? 'Sélectionne d’abord un salon de destination.'
                : 'Envoie un message de test dans le salon configuré.'
            }
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tester l'envoi
          </button>
        }
      />
    </div>
  );
}

function formatTestReason(reason: string): string {
  switch (reason) {
    case 'channel-not-found':
      return 'Salon introuvable ou inaccessible par le bot.';
    case 'missing-permission':
      return 'Permissions manquantes (SendMessages ou EmbedLinks).';
    case 'rate-limit-exhausted':
      return 'Limite de débit Discord atteinte, réessaie dans quelques secondes.';
    default:
      return 'Erreur inattendue, consulte les logs du serveur.';
  }
}
