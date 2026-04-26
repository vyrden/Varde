import { Separator } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { BotSettingsForm } from '../../../../../components/settings/BotSettingsForm';
import { PageBreadcrumb } from '../../../../../components/shell/PageBreadcrumb';
import { ApiError, fetchAdminGuilds } from '../../../../../lib/api-client';
import { BotSettingsApiError, fetchBotSettings } from '../../../../../lib/bot-settings-client';
import type { BotSettingsDto } from '../../../../../lib/bot-settings-types';

interface BotSettingsPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/**
 * Page paramètres globaux du bot. Trois réglages cards (langue,
 * fuseau horaire, couleur embed par défaut) + sidebar « À propos ».
 *
 * Les paramètres MEE6-spécifiques (préfixe textuel, toggle commandes
 * slash, monetize) ne sont pas exposés — Varde est slash-only et
 * sans monétisation. La gestion des admins (« Bot Masters » MEE6)
 * passe déjà par la page `/settings/permissions`, pas dupliqué ici.
 */
export default async function BotSettingsPage({
  params,
}: BotSettingsPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let settings: BotSettingsDto;
  try {
    [guilds, settings] = await Promise.all([fetchAdminGuilds(), fetchBotSettings(guildId)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    if (error instanceof BotSettingsApiError && error.status === 401) redirect('/');
    if (error instanceof BotSettingsApiError && error.status === 403) notFound();
    throw error;
  }
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb
          items={[{ label: 'Paramètres', href: `/guilds/${guildId}/settings` }, { label: 'Bot' }]}
        />
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 1.5l1.5 2.6 3 .4-2.2 2.2.5 3-2.8-1.5-2.8 1.5.5-3-2.2-2.2 3-.4z"
                fill="currentColor"
                opacity="0.2"
              />
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">Paramètres du bot</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Ajuste le comportement global du bot sur ce serveur. Langue, fuseau horaire et couleur des
          embeds — appliqués à tous les modules.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <BotSettingsForm guildId={guildId} initial={settings} />
      </div>
    </>
  );
}
