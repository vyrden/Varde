import { Tooltip } from '@varde/ui';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactElement } from 'react';

interface RailGuild {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

export interface GuildRailProps {
  readonly guilds: readonly RailGuild[];
  readonly currentGuildId: string;
}

/**
 * Construit l'URL OAuth2 d'invitation du bot. Le client ID Discord
 * est lu depuis `VARDE_DISCORD_CLIENT_ID` côté serveur. Permissions
 * fixées à `8` (Administrator) — ajustable en cas de durcissement
 * sécu, mais pour un bot auto-hébergé c'est l'usage habituel.
 *
 * Scope volontairement réduit à `bot` — pas d'`applications.commands`.
 * Inclure `applications.commands` dans le scope force Discord à
 * exiger qu'une redirect URI soit enregistrée côté portail dev,
 * sinon le portail OAuth refuse avec « redirect_uri non valide ».
 * Or les slash commands sont enregistrées par le bot lui-même via
 * `PUT /applications/{appId}/guilds/{guildId}/commands` après chaque
 * join (cf. `apps/bot/src/slash-registration.ts`) — ce scope est
 * inutile au moment de l'invitation et imposerait une étape de
 * config supplémentaire à l'admin pour rien.
 */
function buildInviteUrl(): string | null {
  const clientId = process.env['VARDE_DISCORD_CLIENT_ID'];
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot',
    permissions: '8',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Rail vertical des guilds (72 px) — calque exact du rail Discord.
 * Icône carrée arrondie en cercle, qui devient un rectangle à coins
 * arrondis quand on hover ou que la guild est sélectionnée. Initiales
 * en fallback si pas d'icône. Tooltips Discord-style à droite des
 * icônes (`Tooltip side="right"`).
 *
 * Sous la liste des guilds, un bouton « + » ouvre la flow d'invitation
 * Discord OAuth2 dans un nouvel onglet — masqué si
 * `VARDE_DISCORD_CLIENT_ID` n'est pas défini.
 */
export function GuildRail({ guilds, currentGuildId }: GuildRailProps): ReactElement {
  const inviteUrl = buildInviteUrl();

  return (
    <nav
      aria-label="Mes serveurs"
      className="flex w-18 shrink-0 flex-col items-center gap-2 bg-rail py-3"
    >
      <div className="my-1 h-0.5 w-8 rounded bg-surface" aria-hidden="true" />

      {guilds.map((g) => {
        const active = g.id === currentGuildId;
        const shapeClass = active ? 'rounded-xl' : 'rounded-full group-hover:rounded-xl';
        return (
          <Tooltip key={g.id} text={g.name} side="right">
            <Link
              href={`/guilds/${g.id}`}
              aria-label={g.name}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex h-12 w-12 items-center justify-center text-sm font-semibold text-white transition-[border-radius,background-color] duration-200 ease-out focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${shapeClass}`}
              style={{
                backgroundColor: active ? 'var(--primary)' : 'var(--surface-active)',
              }}
            >
              {/*
                 Indicateur d'activité — barre verticale blanche à gauche
                 façon Discord. Hauteur croissante au hover (0 → 20 → 32 px).
                 Doit rester en dehors d'un parent `overflow-hidden` sinon
                 il est clipé hors du rail.
              */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute -left-3 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-foreground transition-[height] duration-200 ease-out ${
                  active ? 'h-8' : 'h-0 group-hover:h-5'
                }`}
              />
              {g.iconUrl ? (
                <Image
                  src={g.iconUrl}
                  alt=""
                  width={48}
                  height={48}
                  className={`h-12 w-12 transition-[border-radius] duration-200 ease-out ${shapeClass}`}
                />
              ) : (
                <span aria-hidden="true">{g.name.slice(0, 2).toUpperCase()}</span>
              )}
            </Link>
          </Tooltip>
        );
      })}

      {inviteUrl !== null ? (
        <>
          <div className="my-1 h-0.5 w-8 rounded bg-surface" aria-hidden="true" />
          <Tooltip text="Inviter le bot sur un serveur" side="right">
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-active text-success transition-[border-radius,background-color,color] duration-200 ease-out hover:rounded-xl hover:bg-success hover:text-white focus-visible:rounded-xl focus-visible:bg-success focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="sr-only">Inviter le bot sur un serveur</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </a>
          </Tooltip>
        </>
      ) : null}

      <div className="mt-auto" />
    </nav>
  );
}
