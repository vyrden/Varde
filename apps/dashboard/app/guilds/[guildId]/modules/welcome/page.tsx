import { PageTitle, UnboundPermissionsBanner } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { WelcomeConfigEditor } from '../../../../../components/welcome/WelcomeConfigEditor';
import {
  ApiError,
  fetchAdminGuilds,
  fetchGuildRoles,
  fetchGuildTextChannels,
  fetchModuleConfig,
  fetchModules,
  fetchUnboundPermissions,
} from '../../../../../lib/api-client';
import { fetchWelcomeFonts, type WelcomeConfigClient } from '../../../../../lib/welcome-actions';

interface WelcomePageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

const DEFAULT_CONFIG: WelcomeConfigClient = {
  version: 1,
  welcome: {
    enabled: false,
    destination: 'channel',
    channelId: null,
    message: '',
    embed: { enabled: false, color: '#5865F2' },
    card: {
      enabled: false,
      backgroundColor: '#2C2F33',
      backgroundImagePath: null,
      text: { titleFontSize: 32, subtitleFontSize: 20, fontFamily: 'sans-serif' },
    },
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: '',
    embed: { enabled: false, color: '#5865F2' },
    card: {
      enabled: false,
      backgroundColor: '#2C2F33',
      backgroundImagePath: null,
      text: { titleFontSize: 32, subtitleFontSize: 20, fontFamily: 'sans-serif' },
    },
  },
  autorole: { enabled: false, roleIds: [], delaySeconds: 0 },
  accountAgeFilter: {
    enabled: false,
    minDays: 0,
    action: 'kick',
    quarantineRoleId: null,
  },
};

/**
 * Normalise la config brute en `WelcomeConfigClient`. Toute clé absente
 * ou mal typée est remplacée par sa valeur par défaut, ce qui couvre
 * les guilds sans config encore enregistrée et les configs créées avant
 * cette version.
 */
function normalizeConfig(raw: unknown): WelcomeConfigClient {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_CONFIG;
  const obj = raw as Record<string, unknown>;
  const welcome = (
    typeof obj['welcome'] === 'object' && obj['welcome'] !== null ? obj['welcome'] : {}
  ) as Record<string, unknown>;
  const goodbye = (
    typeof obj['goodbye'] === 'object' && obj['goodbye'] !== null ? obj['goodbye'] : {}
  ) as Record<string, unknown>;
  const autorole = (
    typeof obj['autorole'] === 'object' && obj['autorole'] !== null ? obj['autorole'] : {}
  ) as Record<string, unknown>;
  const filter = (
    typeof obj['accountAgeFilter'] === 'object' && obj['accountAgeFilter'] !== null
      ? obj['accountAgeFilter']
      : {}
  ) as Record<string, unknown>;

  const messageBlock = (
    block: Record<string, unknown>,
    fallback: WelcomeConfigClient['welcome' | 'goodbye'],
  ): WelcomeConfigClient['welcome'] | WelcomeConfigClient['goodbye'] => {
    const embed = (
      typeof block['embed'] === 'object' && block['embed'] !== null ? block['embed'] : {}
    ) as Record<string, unknown>;
    const card = (
      typeof block['card'] === 'object' && block['card'] !== null ? block['card'] : {}
    ) as Record<string, unknown>;
    return {
      enabled: typeof block['enabled'] === 'boolean' ? block['enabled'] : fallback.enabled,
      channelId: typeof block['channelId'] === 'string' ? (block['channelId'] as string) : null,
      message: typeof block['message'] === 'string' ? (block['message'] as string) : '',
      embed: {
        enabled: typeof embed['enabled'] === 'boolean' ? embed['enabled'] : false,
        color: typeof embed['color'] === 'string' ? (embed['color'] as string) : '#5865F2',
      },
      card: {
        enabled: typeof card['enabled'] === 'boolean' ? card['enabled'] : false,
        backgroundColor:
          typeof card['backgroundColor'] === 'string'
            ? (card['backgroundColor'] as string)
            : '#2C2F33',
        backgroundImagePath:
          typeof card['backgroundImagePath'] === 'string'
            ? (card['backgroundImagePath'] as string)
            : null,
        text: (() => {
          const t = (
            typeof card['text'] === 'object' && card['text'] !== null ? card['text'] : {}
          ) as Record<string, unknown>;
          const ff = t['fontFamily'];
          return {
            titleFontSize:
              typeof t['titleFontSize'] === 'number' ? (t['titleFontSize'] as number) : 32,
            subtitleFontSize:
              typeof t['subtitleFontSize'] === 'number' ? (t['subtitleFontSize'] as number) : 20,
            fontFamily:
              ff === 'serif' || ff === 'monospace' ? (ff as 'serif' | 'monospace') : 'sans-serif',
          };
        })(),
      },
      ...(fallback === DEFAULT_CONFIG.welcome
        ? {
            destination:
              welcome['destination'] === 'dm' || welcome['destination'] === 'both'
                ? welcome['destination']
                : 'channel',
          }
        : {}),
    } as WelcomeConfigClient['welcome'] | WelcomeConfigClient['goodbye'];
  };

  return {
    version: 1,
    welcome: messageBlock(welcome, DEFAULT_CONFIG.welcome) as WelcomeConfigClient['welcome'],
    goodbye: messageBlock(goodbye, DEFAULT_CONFIG.goodbye) as WelcomeConfigClient['goodbye'],
    autorole: {
      enabled: typeof autorole['enabled'] === 'boolean' ? autorole['enabled'] : false,
      roleIds: Array.isArray(autorole['roleIds'])
        ? (autorole['roleIds'] as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      delaySeconds:
        typeof autorole['delaySeconds'] === 'number' ? (autorole['delaySeconds'] as number) : 0,
    },
    accountAgeFilter: {
      enabled: typeof filter['enabled'] === 'boolean' ? filter['enabled'] : false,
      minDays: typeof filter['minDays'] === 'number' ? (filter['minDays'] as number) : 0,
      action: filter['action'] === 'quarantine' ? 'quarantine' : 'kick',
      quarantineRoleId:
        typeof filter['quarantineRoleId'] === 'string'
          ? (filter['quarantineRoleId'] as string)
          : null,
    },
  };
}

export default async function WelcomePage({ params }: WelcomePageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  let moduleConfig: Awaited<ReturnType<typeof fetchModuleConfig>>;
  let unbound: Awaited<ReturnType<typeof fetchUnboundPermissions>>;
  let channels: Awaited<ReturnType<typeof fetchGuildTextChannels>>;
  let roles: Awaited<ReturnType<typeof fetchGuildRoles>>;
  let fonts: Awaited<ReturnType<typeof fetchWelcomeFonts>>;

  try {
    [guilds, modules, moduleConfig, unbound, channels, roles, fonts] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchModuleConfig(guildId, 'welcome'),
      fetchUnboundPermissions(guildId, 'welcome'),
      fetchGuildTextChannels(guildId),
      fetchGuildRoles(guildId),
      fetchWelcomeFonts(guildId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  const welcomeModule = modules.find((m) => m.id === 'welcome');
  if (!guild || !welcomeModule) notFound();

  const initialConfig = normalizeConfig(moduleConfig.config);

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
          <ol className="flex items-center gap-2">
            <li>
              <Link
                href="/"
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                Mes serveurs
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/guilds/${guildId}`}
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                {guild.name}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/guilds/${guildId}`}
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                Modules
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-foreground" aria-current="page">
              {welcomeModule.name}
            </li>
          </ol>
        </nav>

        <PageTitle
          title={welcomeModule.name}
          description="Message d'accueil et de départ avec carte d'avatar, auto-rôle et filtre comptes neufs."
        />

        <div className="mt-2 flex items-center gap-2">
          <span
            className={
              welcomeModule.enabled === false
                ? 'inline-block h-2 w-2 rounded-full bg-muted-foreground/50'
                : 'inline-block h-2 w-2 rounded-full bg-emerald-500'
            }
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground">
            {welcomeModule.enabled === false ? 'Module désactivé' : 'Module activé'}
          </span>
        </div>

        <UnboundPermissionsBanner
          permissions={unbound.map((p) => ({ id: p.id, description: p.description }))}
          configureHref={`/guilds/${guildId}/settings/permissions?focus=welcome`}
        />

        {welcomeModule.enabled === false ? (
          <div
            role="status"
            className="rounded-lg border border-blue-300 bg-blue-50 p-6 text-blue-900 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-100"
          >
            <p className="font-semibold">Le module n'est pas activé sur cette guild.</p>
            <p className="mt-2 text-sm">
              Tant que le module n'est pas activé, aucun message d'accueil ne sera posté.
            </p>
          </div>
        ) : (
          <WelcomeConfigEditor
            guildId={guildId}
            initialConfig={initialConfig}
            channels={channels}
            roles={roles}
            availableFonts={fonts.length > 0 ? fonts : ['sans-serif', 'serif', 'monospace']}
          />
        )}
      </div>
    </>
  );
}
