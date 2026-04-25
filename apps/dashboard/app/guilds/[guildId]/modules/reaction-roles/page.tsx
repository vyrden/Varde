import { Badge, PageHeader, UnboundPermissionsBanner } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import type { ReactionRoleMessageClient } from '../../../../../components/reaction-roles/ReactionRolesConfigEditor';
import { ReactionRolesConfigEditor } from '../../../../../components/reaction-roles/ReactionRolesConfigEditor';
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

/**
 * Normalise la config brute retournée par l'API en un tableau de
 * `ReactionRoleMessageClient`. Retourne un tableau vide si la config est
 * absente ou malformée — la guild n'a pas encore de reaction-roles configurés.
 */
/** Forme intermédiaire typée pour le parsing de la config brute. */
interface RawRRMessage {
  id?: unknown;
  label?: unknown;
  channelId?: unknown;
  messageId?: unknown;
  message?: unknown;
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
  emoji?: unknown;
  roleId?: unknown;
}

function normalizeMessages(raw: unknown): readonly ReactionRoleMessageClient[] {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  // biome-ignore lint/complexity/useLiteralKeys: noUncheckedIndexedAccess requires bracket notation
  const messages = Array.isArray(obj['messages']) ? obj['messages'] : [];
  return messages
    .filter((m): m is RawRRMessage => typeof m === 'object' && m !== null)
    .map((m) => {
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
          return { emoji: clientEmoji, roleId: String(p.roleId ?? '') };
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
        feedback: feedback === 'none' ? 'none' : 'dm',
        pairs,
      };
    });
}

/**
 * Page de configuration du module reaction-roles pour une guild. Charge en
 * parallèle les données nécessaires : descripteur de module, config,
 * permissions non liées, salons texte et rôles Discord.
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
      <PageHeader
        breadcrumbs={[{ label: 'Modules', href: `/guilds/${guildId}` }, { label: rrModule.name }]}
        title={rrModule.name}
        description="Permets à tes membres de s'auto-attribuer des rôles en cliquant sur des emojis. Idéal pour les couleurs de nom, les notifications, la vérification, etc."
        actions={
          <Badge variant={isEnabled ? 'active' : 'inactive'}>
            {isEnabled ? 'Actif' : 'Inactif'}
          </Badge>
        }
      />
      <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-6">
        <UnboundPermissionsBanner
          permissions={unbound.map((p) => ({ id: p.id, description: p.description }))}
          configureHref={`/guilds/${guildId}/settings/permissions?focus=reaction-roles`}
        />

        {!isEnabled ? (
          <div
            role="status"
            className="rounded-lg border border-blue-300 bg-blue-50 p-6 text-blue-900 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-100"
          >
            <p className="font-semibold">Le module n'est pas activé sur cette guild.</p>
            <p className="mt-2 text-sm">
              Tant que le module n'est pas activé, aucune réaction ne sera traitée. L'activation se
              fait automatiquement lorsque le bot rejoint une nouvelle guild (voir{' '}
              <code>DEFAULT_ENABLED_MODULES</code> dans <code>apps/server/src/bin.ts</code>). Si tu
              as invité le bot avant que ce module existe, redémarre le serveur après avoir ajouté
              l'ID de ta guild dans <code>VARDE_SEED_GUILD_IDS</code>.
            </p>
          </div>
        ) : (
          <ReactionRolesConfigEditor
            guildId={guildId}
            initialMessages={initialMessages}
            channels={channels}
            roles={roles}
            emojis={emojis}
          />
        )}
      </div>
    </>
  );
}
