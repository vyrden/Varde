'use client';

import {
  Card,
  CardContent,
  StickyActionBar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@varde/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import { saveModuleConfig } from '../../lib/actions';
import type { AuditLogItemDto } from '../../lib/api-client';
import { isRuleComplete } from './rule-blanks';
import { AutomodTab } from './tabs/AutomodTab';
import { GeneralTab } from './tabs/GeneralTab';
import { HistoryTab } from './tabs/HistoryTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import type {
  AutomodRuleClient,
  ChannelOption,
  ModerationConfigInitial,
  RestrictedChannelClient,
  RoleOption,
} from './types';

export type {
  AiCategoryClient,
  AutomodActionClient,
  AutomodConfigClient,
  AutomodRuleClient,
  ChannelOption,
  KeywordListLanguageClient,
  ModerationConfigInitial,
  RestrictedChannelClient,
  RestrictedChannelModeClient,
  RoleOption,
} from './types';

const TAB_VALUES = ['general', 'automod', 'permissions', 'history'] as const;
type TabValue = (typeof TAB_VALUES)[number];

const isTabValue = (raw: unknown): raw is TabValue =>
  typeof raw === 'string' && (TAB_VALUES as ReadonlyArray<string>).includes(raw);

const TAB_LABELS: Record<TabValue, string> = {
  general: 'Général',
  automod: 'Automod',
  permissions: 'Permissions',
  history: 'Historique',
};

/**
 * Tabs où la `StickyActionBar` est affichée. `history` est read-only
 * — pas de save bar.
 */
const EDITABLE_TABS: ReadonlySet<TabValue> = new Set<TabValue>([
  'general',
  'automod',
  'permissions',
]);

export interface ModerationConfigFormProps {
  readonly guildId: string;
  readonly initial: ModerationConfigInitial;
  readonly roles: readonly RoleOption[];
  readonly channels: readonly ChannelOption[];
  readonly statusCard: ReactNode;
  readonly auditInitialItems: readonly AuditLogItemDto[];
  readonly auditInitialNextCursor: string | undefined;
  readonly knownActions: readonly string[];
}

/**
 * Shell orchestrateur de la page Moderation. Détient l'intégralité du
 * state édité (mutedRoleId, dmOnSanction, rules, bypassRoleIds,
 * restrictedChannels) — chaque tab est presentational et reçoit son
 * slice + setters.
 *
 * Tab actif synchronisé avec `?tab=…` dans l'URL via
 * `useSearchParams` + `router.replace` — un lien direct vers
 * `/moderation?tab=automod` ouvre le bon tab, et un changement de
 * tab met à jour l'URL sans navigation. L'état d'édition NON
 * sauvegardé survit au changement de tab — un dirty change sur
 * Automod n'est pas perdu en passant sur Permissions.
 *
 * `StickyActionBar` rend boutons Annuler / Enregistrer en bas du
 * container, avec strip jaune dirty et message d'erreur de save
 * inline. Cancel restore l'état initial.
 */
export function ModerationConfigForm({
  guildId,
  initial,
  roles,
  channels,
  statusCard,
  auditInitialItems,
  auditInitialNextCursor,
  knownActions,
}: ModerationConfigFormProps): ReactElement {
  // ─── State édité ─────────────────────────────────────────────────
  const [mutedRoleId, setMutedRoleId] = useState(initial.mutedRoleId ?? '');
  const [dmOnSanction, setDmOnSanction] = useState(initial.dmOnSanction);
  const [rules, setRules] = useState<readonly AutomodRuleClient[]>(initial.automod.rules);
  const [bypassRoleIds, setBypassRoleIds] = useState<readonly string[]>(
    initial.automod.bypassRoleIds,
  );
  const [restrictedChannels, setRestrictedChannels] = useState<readonly RestrictedChannelClient[]>(
    initial.restrictedChannels,
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  // ─── Tab actif piloté par URL ?tab=… ─────────────────────────────
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = isTabValue(searchParams.get('tab'))
    ? (searchParams.get('tab') as TabValue)
    : 'general';
  const [tab, setTab] = useState<TabValue>(initialTab);

  // `searchParams` est passé via ref pour ne pas relancer l'effet à
  // chaque mutation d'URL (router.replace qu'on déclenche modifie
  // searchParams, ce qui causerait une boucle infinie). On lit donc
  // la valeur courante au moment où l'effet tire, sans la déclarer
  // en dépendance.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (tab === 'general') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const qs = params.toString();
    router.replace(qs.length > 0 ? `?${qs}` : '?', { scroll: false });
  }, [tab, router]);

  // ─── Snapshot pour Cancel + détection dirty ──────────────────────
  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        mutedRoleId: initial.mutedRoleId ?? '',
        dmOnSanction: initial.dmOnSanction,
        rules: initial.automod.rules,
        bypassRoleIds: initial.automod.bypassRoleIds,
        restrictedChannels: initial.restrictedChannels,
      }),
    [initial],
  );

  const currentSnapshot = JSON.stringify({
    mutedRoleId,
    dmOnSanction,
    rules,
    bypassRoleIds,
    restrictedChannels,
  });

  const dirty = currentSnapshot !== initialSnapshot;

  const onCancel = (): void => {
    setMutedRoleId(initial.mutedRoleId ?? '');
    setDmOnSanction(initial.dmOnSanction);
    setRules(initial.automod.rules);
    setBypassRoleIds(initial.automod.bypassRoleIds);
    setRestrictedChannels(initial.restrictedChannels);
    setFeedback(null);
  };

  const onSave = (): void => {
    setFeedback(null);
    startTransition(async () => {
      const payload = {
        version: 1,
        mutedRoleId: mutedRoleId.length > 0 ? mutedRoleId : null,
        dmOnSanction,
        automod: {
          rules: rules.filter(isRuleComplete),
          bypassRoleIds,
        },
        restrictedChannels: restrictedChannels.filter((rc) => rc.modes.length > 0),
      };
      const result = await saveModuleConfig(guildId, 'moderation', payload);
      if (result.ok) {
        setFeedback({ kind: 'success', message: 'Configuration enregistrée.' });
      } else {
        const detail = result.details?.[0];
        const msg = detail
          ? `${detail.path.join('.')}: ${detail.message}`
          : (result.message ?? `Erreur ${result.status ?? ''}`);
        setFeedback({ kind: 'error', message: msg });
      }
    });
  };

  // Description contextuelle pour la StickyActionBar : laisse le
  // défaut "Modifications non sauvegardées." sauf si on a un message
  // success/error qui supplante (l'utilisateur veut voir le résultat
  // de son action). Le message disparaît au prochain changement
  // (setFeedback(null) dans onSave/onCancel).
  const barDescription =
    feedback?.kind === 'success' ? (
      <span className="text-success">{feedback.message}</span>
    ) : feedback?.kind === 'error' ? (
      <span className="text-destructive">{feedback.message}</span>
    ) : undefined;

  const showActionBar = EDITABLE_TABS.has(tab);

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <Tabs value={tab} onValueChange={(next) => setTab(next as TabValue)}>
          <TabsList ariaLabel="Sections du module moderation">
            {TAB_VALUES.map((tabValue) => (
              <TabsTrigger key={tabValue} value={tabValue}>
                {TAB_LABELS[tabValue]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="general">
            <GeneralTab
              mutedRoleId={mutedRoleId}
              onMutedRoleChange={setMutedRoleId}
              dmOnSanction={dmOnSanction}
              onDmOnSanctionChange={setDmOnSanction}
              pending={pending}
              roles={roles}
              statusCard={statusCard}
            />
          </TabsContent>

          <TabsContent value="automod">
            <AutomodTab rules={rules} onRulesChange={setRules} pending={pending} />
          </TabsContent>

          <TabsContent value="permissions">
            <PermissionsTab
              bypassRoleIds={bypassRoleIds}
              onBypassRoleIdsChange={setBypassRoleIds}
              restrictedChannels={restrictedChannels}
              onRestrictedChannelsChange={setRestrictedChannels}
              pending={pending}
              roles={roles}
              channels={channels}
            />
          </TabsContent>

          <TabsContent value="history" forceMount={false}>
            <HistoryTab
              guildId={guildId}
              initialItems={auditInitialItems}
              initialNextCursor={auditInitialNextCursor}
              knownActions={knownActions}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
      {showActionBar ? (
        <StickyActionBar
          dirty={dirty}
          pending={pending}
          onCancel={onCancel}
          onSave={onSave}
          description={barDescription}
        />
      ) : null}
    </Card>
  );
}
