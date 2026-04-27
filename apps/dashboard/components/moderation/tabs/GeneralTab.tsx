'use client';

import { Card, CardContent, CardHeader, CardTitle, Select, Toggle } from '@varde/ui';
import type { ReactElement, ReactNode } from 'react';

import type { RoleOption } from '../types';

export interface GeneralTabProps {
  readonly mutedRoleId: string;
  readonly onMutedRoleChange: (next: string) => void;
  readonly dmOnSanction: boolean;
  readonly onDmOnSanctionChange: (next: boolean) => void;
  readonly pending: boolean;
  readonly roles: readonly RoleOption[];
  /**
   * Bloc « Statut du module » — version + nombre de commandes +
   * toggle activé. Fourni par le shell (l'orchestrateur) pour rester
   * cohérent avec la sidebar de l'ancienne page sans dupliquer la
   * logique d'enabling.
   */
  readonly statusCard: ReactNode;
}

/**
 * Tab « Général ». Volontairement minimal : statut du module +
 * comportement des sanctions. Pas de règles, pas de listes —
 * c'est l'écran d'onboarding pour un admin lambda qui veut
 * juste activer la modération de base.
 */
export function GeneralTab({
  mutedRoleId,
  onMutedRoleChange,
  dmOnSanction,
  onDmOnSanctionChange,
  pending,
  roles,
  statusCard,
}: GeneralTabProps): ReactElement {
  return (
    <div className="space-y-6 py-4">
      {statusCard}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comportement des sanctions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div className="space-y-1.5">
            <label
              htmlFor="moderation-muted-role"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Rôle muet
            </label>
            <Select
              id="moderation-muted-role"
              value={mutedRoleId}
              onChange={(e) => onMutedRoleChange(e.target.value)}
              disabled={pending}
            >
              <option value="">— Aucun —</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  @{role.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Ce rôle est assigné par <code>/mute</code> et <code>/tempmute</code>. Sans rôle
              configuré, ces commandes échouent.
            </p>
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-border pt-4">
            <div className="flex-1 space-y-0.5">
              <p className="font-medium text-foreground">DM sur sanction</p>
              <p className="text-xs text-muted-foreground">
                Envoie un message privé au membre sanctionné avec la raison. Échec silencieux si ses
                DMs sont fermés — la sanction s'applique quand même.
              </p>
            </div>
            <Toggle
              checked={dmOnSanction}
              onCheckedChange={onDmOnSanctionChange}
              disabled={pending}
              label={
                dmOnSanction ? 'Désactiver les DMs de sanction' : 'Activer les DMs de sanction'
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
