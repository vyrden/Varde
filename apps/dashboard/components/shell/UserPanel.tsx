import Image from 'next/image';
import type { ReactElement } from 'react';

import { signOut } from '../../auth';

export interface UserPanelProps {
  readonly name: string;
  readonly avatarUrl?: string | null;
  /**
   * URL du PNG transparent de la décoration d'avatar Discord (Nitro
   * profile decoration). Posé en overlay 1.4× au-dessus de l'avatar.
   * Null si l'utilisateur n'en a pas configuré.
   */
  readonly avatarDecorationUrl?: string | null;
  /** Rôle affiché dans le badge. V1 : toujours `admin` ; `moderator` en attente de la vue mod (post-jalon-4). */
  readonly userRole: 'admin' | 'moderator';
}

const ROLE_LABEL: Record<UserPanelProps['userRole'], string> = {
  admin: 'Administrateur',
  moderator: 'Modérateur',
};

const ROLE_BADGE_CLASS: Record<UserPanelProps['userRole'], string> = {
  admin: 'bg-destructive/20 text-destructive',
  moderator: 'bg-primary/20 text-primary',
};

/**
 * Panel utilisateur en bas de `GuildSidebar`. Calque le bloc
 * utilisateur du client Discord (avatar + statut + pseudo + badge
 * de rôle + logout iconique). Le bouton Logout est un `<form>` avec
 * server action — Auth.js v5 gère le CSRF.
 *
 * Avatar : image Discord si fournie, sinon initiale en fond
 * `--primary` (cohérent avec le rail Discord pour les guilds sans
 * icône).
 */
export function UserPanel({
  name,
  avatarUrl,
  avatarDecorationUrl,
  userRole,
}: UserPanelProps): ReactElement {
  const initial = name.charAt(0).toUpperCase() || '?';
  return (
    <div className="flex items-center gap-2.5 border-t border-black/30 bg-rail px-3 py-2.5">
      <div className="relative h-10 w-10 shrink-0">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 select-none rounded-full"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-10 w-10 select-none items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground"
          >
            {initial}
          </div>
        )}
        {avatarDecorationUrl ? (
          <Image
            src={avatarDecorationUrl}
            alt=""
            width={56}
            height={56}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 h-14 w-14 max-w-none select-none"
          />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 z-10 h-3 w-3 rounded-full border-[3px] border-rail bg-success"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate text-[15px] font-semibold leading-tight text-foreground"
          title={name}
        >
          {name}
        </span>
        <span className="flex items-center gap-1">
          <span
            className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASS[userRole]}`}
          >
            {ROLE_LABEL[userRole]}
          </span>
        </span>
      </div>

      <div className="group relative shrink-0">
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            aria-label="Se déconnecter"
            className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors duration-150 ease-out hover:bg-destructive/15 hover:text-destructive focus-visible:bg-destructive/15 focus-visible:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
        <span
          role="tooltip"
          className="pointer-events-none invisible absolute right-0 bottom-full mb-1.5 whitespace-nowrap rounded bg-rail px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-lg transition-opacity duration-150 ease-out group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        >
          Se déconnecter
        </span>
      </div>
    </div>
  );
}
