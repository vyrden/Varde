import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  UnboundPermissionsBanner,
} from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { ModuleEnabledToggle } from '../../../../../components/ModuleEnabledToggle';
import type { ReactionRoleMessageClient } from '../../../../../components/reaction-roles/ReactionRolesConfigEditor';
import { ReactionRolesConfigEditor } from '../../../../../components/reaction-roles/ReactionRolesConfigEditor';
import { moduleIcon } from '../../../../../components/shell/module-icons';
import { PageBreadcrumb } from '../../../../../components/shell/PageBreadcrumb';
import {
  ApiError,
  fetchAdminGuilds,
  fetchGuildEmojis,
  fetchGuildRoles,
  fetchGuildTextChannels,
  fetchModuleConfig,
  fetchModules,
  fetchUnboundPermissions,
} from '../../../../../lib/api-client';

interface ReactionRolesPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/** Forme intermédiaire typée pour le parsing de la config brute. */
interface RawRRMessage {
  id?: unknown;
  label?: unknown;
  channelId?: unknown;
  messageId?: unknown;
  message?: unknown;
  /** Historique : `'reactions' | 'buttons'` au niveau message (V2 initial). */
  kind?: unknown;
  mode?: unknown;
  feedback?: unknown;
  pairs?: unknown;
}

interface RawRREmoji {
  type?: unknown;
  value?: unknown;
  id?: unknown;
  name?: unknown;
  animated?: unknown;
}

interface RawRRPair {
  /** Nouveau (V2 finale) : `'reaction' | 'button'` par paire. */
  kind?: unknown;
  emoji?: unknown;
  roleId?: unknown;
  label?: unknown;
  style?: unknown;
}

/**
 * Normalise la config brute retournée par l'API en un tableau de
 * `ReactionRoleMessageClient`. Retourne un tableau vide si la config est
 * absente ou malformée — la guild n'a pas encore de reaction-roles configurés.
 */
function normalizeMessages(raw: unknown): readonly ReactionRoleMessageClient[] {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const messages = Array.isArray(obj['messages']) ? obj['messages'] : [];
  const messageLevelKind = obj['kind'];
  return messages
    .filter((m): m is RawRRMessage => typeof m === 'object' && m !== null)
    .map((m) => {
      const fallbackPairKind: 'reaction' | 'button' =
        m.kind === 'buttons' || messageLevelKind === 'buttons' ? 'button' : 'reaction';
      const rawPairs = Array.isArray(m.pairs) ? (m.pairs as unknown[]) : [];
      const pairs = rawPairs
        .filter((p): p is RawRRPair => typeof p === 'object' && p !== null)
        .map((p) => {
          const emoji =
            typeof p.emoji === 'object' && p.emoji !== null
              ? (p.emoji as RawRREmoji)
              : ({} as RawRREmoji);
          const clientEmoji: ReactionRoleMessageClient['pairs'][number]['emoji'] =
            emoji.type === 'unicode'
              ? { type: 'unicode', value: String(emoji.value ?? '') }
              : {
                  type: 'custom',
                  id: String(emoji.id ?? ''),
                  name: String(emoji.name ?? ''),
                  animated: Boolean(emoji.animated ?? false),
                };
          const pairKind: 'reaction' | 'button' =
            p.kind === 'button' || p.kind === 'reaction' ? p.kind : fallbackPairKind;
          const style: 'primary' | 'secondary' | 'success' | 'danger' =
            p.style === 'primary' ||
            p.style === 'secondary' ||
            p.style === 'success' ||
            p.style === 'danger'
              ? p.style
              : 'secondary';
          return {
            kind: pairKind,
            emoji: clientEmoji,
            roleId: String(p.roleId ?? ''),
            label: typeof p.label === 'string' ? p.label : '',
            style,
          };
        });
      const mode = m.mode;
      const feedback = m.feedback;
      return {
        id: String(m.id ?? ''),
        label: String(m.label ?? ''),
        channelId: String(m.channelId ?? ''),
        messageId: String(m.messageId ?? ''),
        message: typeof m.message === 'string' ? m.message : '',
        mode: mode === 'unique' || mode === 'verifier' ? mode : 'normal',
        feedback: feedback === 'none' ? 'none' : feedback === 'ephemeral' ? 'ephemeral' : 'dm',
        pairs,
      };
    });
}

/**
 * Page de configuration du module reaction-roles. Layout custom :
 * header (breadcrumb / icône / titre / badge / description) +
 * Separator + bannières + éditeur (qui gère lui-même le grid 2/3 ↔
 * 1/3 selon la vue active : liste avec sidebar « À propos », ou
 * formulaire avec sidebar « Aperçu Discord »).
 */
export default async function ReactionRolesPage({
  params,
}: ReactionRolesPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  let moduleConfig: Awaited<ReturnType<typeof fetchModuleConfig>>;
  let unbound: Awaited<ReturnType<typeof fetchUnboundPermissions>>;
  let channels: Awaited<ReturnType<typeof fetchGuildTextChannels>>;
  let roles: Awaited<ReturnType<typeof fetchGuildRoles>>;
  let emojis: Awaited<ReturnType<typeof fetchGuildEmojis>>;

  try {
    [guilds, modules, moduleConfig, unbound, channels, roles, emojis] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchModuleConfig(guildId, 'reaction-roles'),
      fetchUnboundPermissions(guildId, 'reaction-roles'),
      fetchGuildTextChannels(guildId),
      fetchGuildRoles(guildId),
      fetchGuildEmojis(guildId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  const rrModule = modules.find((m) => m.id === 'reaction-roles');
  if (!guild || !rrModule) notFound();

  const initialMessages = normalizeMessages(moduleConfig.config);
  const isEnabled = rrModule.enabled !== false;

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb
          items={[{ label: 'Modules', href: `/guilds/${guildId}` }, { label: rrModule.name }]}
        />
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
              isEnabled ? 'bg-primary/15 text-primary' : 'bg-surface-active text-muted-foreground'
            }`}
          >
            {moduleIcon('reaction-roles', 20)}
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
            {rrModule.name}
          </h1>
          <Badge variant={isEnabled ? 'active' : 'inactive'}>
            {isEnabled ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Permets à tes membres de s'auto-attribuer des rôles en cliquant sur des emojis. Idéal pour
          les couleurs de nom, les notifications, la vérification, etc.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-6 py-6">
        <UnboundPermissionsBanner
          permissions={unbound.map((p) => ({ id: p.id, description: p.description }))}
          configureHref={`/guilds/${guildId}/settings/permissions?focus=reaction-roles`}
        />

        {!isEnabled ? (
          <div
            role="status"
            className="flex items-start justify-between gap-4 rounded-lg border border-info/40 bg-info/10 p-5 text-foreground"
          >
            <div>
              <p className="font-semibold">Le module n'est pas activé sur cette guild.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tant qu'il reste désactivé, aucune réaction ne sera traitée. Activez-le pour
                reprendre l'attribution des rôles.
              </p>
            </div>
            <ModuleEnabledToggle
              guildId={guildId}
              moduleId={rrModule.id}
              moduleName={rrModule.name}
              initialEnabled={isEnabled}
            />
          </div>
        ) : (
          <ReactionRolesConfigEditor
            guildId={guildId}
            initialMessages={initialMessages}
            channels={channels}
            roles={roles}
            emojis={emojis}
            statusCard={
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Statut du module</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono text-foreground">v{rrModule.version}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Activation</span>
                    <ModuleEnabledToggle
                      guildId={guildId}
                      moduleId={rrModule.id}
                      moduleName={rrModule.name}
                      initialEnabled={isEnabled}
                    />
                  </div>
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                    Permets à tes membres de s'auto-attribuer des rôles en cliquant sur des emojis.
                  </p>
                </CardContent>
              </Card>
            }
          />
        )}
      </div>
    </>
  );
}
