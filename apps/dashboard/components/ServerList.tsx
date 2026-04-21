import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { AdminGuildDto } from '../lib/api-client';

export interface ServerListProps {
  readonly guilds: readonly AdminGuildDto[];
}

/**
 * Grille des serveurs administrables. Chaque carte pointe vers la
 * page détails de la guild (`/guilds/:guildId`) qui liste ses modules
 * et laisse éditer leur config.
 *
 * Retombe sur un `EmptyState` explicite quand l'intersection
 * `user admin` ∩ `bot présent` est vide, pour éviter une page vide
 * difficile à diagnostiquer (« est-ce que le bot est sur ce serveur ?
 * est-ce que j'ai les droits ? »).
 */
export function ServerList({ guilds }: ServerListProps): ReactElement {
  if (guilds.length === 0) {
    return (
      <EmptyState
        title="Aucun serveur à afficher"
        description="Vous n'administrez aucun serveur où le bot est installé. Invitez le bot sur un serveur dont vous gérez les paramètres pour commencer."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {guilds.map((guild) => (
        <Link
          key={guild.id}
          href={`/guilds/${guild.id}`}
          className="block transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring rounded-lg"
        >
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              {guild.iconUrl ? (
                <img
                  src={guild.iconUrl}
                  alt=""
                  className="h-10 w-10 rounded-full border border-border"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {guild.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <CardTitle className="line-clamp-1">{guild.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Gérer ce serveur →</CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
