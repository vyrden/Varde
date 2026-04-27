'use client';

import { Button } from '@varde/ui';
import type { ReactElement, ReactNode } from 'react';

import { LandingEmptyState } from './LandingEmptyState';
import { ReactionRoleCard } from './ReactionRoleCard';
import type { EmojiCatalog, ReactionRoleMessageClient, RoleOption } from './types';

export interface ReactionRolesListProps {
  readonly messages: readonly ReactionRoleMessageClient[];
  readonly channelNameById: Readonly<Record<string, string>>;
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  readonly onAddNew: () => void;
  readonly onEdit: (id: string) => void;
  readonly onDelete: (id: string) => void;
  /** Card "Statut du module" injectée par la page (server-rendered). */
  readonly statusCard: ReactNode;
}

/**
 * Vue landing des reaction-roles. Pas de tableau : grid de
 * `<ReactionRoleCard>`. Quand vide, `<LandingEmptyState>` prend le
 * relais avec illustration + 3 cas d'usage + CTA. La sidebar À propos
 * a été retirée — le statut module vit dans `statusCard` injecté par
 * la page (cohérent avec Moderation/Logs).
 */
export function ReactionRolesList({
  messages,
  channelNameById,
  roles,
  emojis,
  onAddNew,
  onEdit,
  onDelete,
  statusCard,
}: ReactionRolesListProps): ReactElement {
  return (
    <div className="flex flex-col gap-5">
      {statusCard}

      {messages.length === 0 ? (
        <LandingEmptyState onCreate={onAddNew} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Messages reaction-roles</h2>
              <p className="text-sm text-muted-foreground">
                {messages.length} message{messages.length > 1 ? 's' : ''} configuré
                {messages.length > 1 ? 's' : ''} sur cette guild.
              </p>
            </div>
            <Button type="button" size="sm" onClick={onAddNew}>
              + Nouveau reaction-role
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {messages.map((m) => (
              <ReactionRoleCard
                key={m.id}
                message={m}
                channelName={channelNameById[m.channelId] ?? m.channelId}
                roles={roles}
                emojis={emojis}
                onEdit={() => onEdit(m.id)}
                onDelete={() => onDelete(m.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
