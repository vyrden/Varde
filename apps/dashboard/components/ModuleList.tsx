import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../lib/api-client';

export interface ModuleListProps {
  readonly guildId: string;
  readonly modules: readonly ModuleListItemDto[];
}

/**
 * Liste des modules d'une guild. Chaque carte renvoie vers la page
 * de configuration du module. Le toggle enable/disable arrive en
 * post-V1 — pour l'instant on affiche juste un `Badge` d'état.
 */
export function ModuleList({ guildId, modules }: ModuleListProps): ReactElement {
  if (modules.length === 0) {
    return (
      <EmptyState
        title="Aucun module chargé"
        description="Le core n'a chargé aucun module pour cette guild. Vérifiez la configuration du serveur."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {modules.map((module) => (
        <li key={module.id}>
          <Link
            href={`/guilds/${guildId}/modules/${module.id}`}
            className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>{module.name}</CardTitle>
                  <CardDescription>v{module.version}</CardDescription>
                </div>
                <Badge variant={module.enabled ? 'default' : 'secondary'}>
                  {module.enabled ? 'Activé' : 'Désactivé'}
                </Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {module.description || 'Aucune description fournie par le manifest.'}
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
