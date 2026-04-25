import Image from 'next/image';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { signOut } from '../../auth';

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
 * Rail vertical des guilds (72 px) — calque exact du rail Discord.
 * Icône carrée arrondie en cercle, qui devient un rectangle à coins
 * arrondis quand on hover ou que la guild est sélectionnée. Initiales
 * en fallback si pas d'icône.
 */
export function GuildRail({ guilds, currentGuildId }: GuildRailProps): ReactElement {
  return (
    <nav
      aria-label="Mes serveurs"
      className="flex w-18 shrink-0 flex-col items-center gap-2 bg-rail py-3"
    >
      <Link
        href="/"
        title="Tous les serveurs"
        aria-label="Retour à la sélection de serveur"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-active text-foreground transition-all duration-150 hover:rounded-xl hover:bg-primary hover:text-primary-foreground focus-visible:rounded-xl focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 12l9-9 9 9M5 10v10h14V10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <div className="my-1 h-0.5 w-8 rounded bg-surface" aria-hidden="true" />

      {guilds.map((g) => {
        const active = g.id === currentGuildId;
        return (
          <Link
            key={g.id}
            href={`/guilds/${g.id}`}
            title={g.name}
            aria-label={g.name}
            aria-current={active ? 'page' : undefined}
            className={`relative flex h-12 w-12 items-center justify-center overflow-hidden text-sm font-semibold text-white transition-all duration-150 hover:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? 'rounded-xl' : 'rounded-full'
            }`}
            style={{
              backgroundColor: active ? 'var(--primary)' : 'var(--surface-active)',
            }}
          >
            {/* Indicateur d'activité — barre verticale blanche à gauche */}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-foreground"
              />
            ) : null}
            {g.iconUrl ? (
              <Image src={g.iconUrl} alt="" width={48} height={48} className="h-12 w-12" />
            ) : (
              <span aria-hidden="true">{g.name.slice(0, 2).toUpperCase()}</span>
            )}
          </Link>
        );
      })}

      <div className="mt-auto" />

      {/* Sign-out (déplacé depuis l'ancien DashboardHeader) */}
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/' });
        }}
      >
        <button
          type="submit"
          title="Se déconnecter"
          aria-label="Se déconnecter"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-active text-muted-foreground transition-all duration-150 hover:rounded-xl hover:bg-destructive hover:text-destructive-foreground focus-visible:rounded-xl focus-visible:bg-destructive focus-visible:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </nav>
  );
}
