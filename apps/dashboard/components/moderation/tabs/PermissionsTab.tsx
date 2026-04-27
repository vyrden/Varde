'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import type { ReactElement } from 'react';

import { BypassRolesPicker } from '../BypassRolesPicker';
import { RestrictedChannelsSection } from '../RestrictedChannelsSection';
import type { ChannelOption, RestrictedChannelClient, RoleOption } from '../types';

export interface PermissionsTabProps {
  readonly bypassRoleIds: ReadonlyArray<string>;
  readonly onBypassRoleIdsChange: (next: ReadonlyArray<string>) => void;
  readonly restrictedChannels: ReadonlyArray<RestrictedChannelClient>;
  readonly onRestrictedChannelsChange: (next: ReadonlyArray<RestrictedChannelClient>) => void;
  readonly pending: boolean;
  readonly roles: ReadonlyArray<RoleOption>;
  readonly channels: ReadonlyArray<ChannelOption>;
}

/**
 * Tab « Permissions ». Deux blocs distincts :
 *
 * - **Rôles bypass** : qui est exempté de l'automod (mods, etc.).
 * - **Salons restreints** : politique de contenu par salon — modifie
 *   ce qui est ACCEPTÉ dans le salon (pas ce qui est sanctionné).
 *
 * Les deux concepts touchent à des « permissions de contenu » au sens
 * large, d'où leur regroupement dans un même tab.
 */
export function PermissionsTab({
  bypassRoleIds,
  onBypassRoleIdsChange,
  restrictedChannels,
  onRestrictedChannelsChange,
  pending,
  roles,
  channels,
}: PermissionsTabProps): ReactElement {
  const updateRestrictedChannel = (channelId: string, next: RestrictedChannelClient): void => {
    onRestrictedChannelsChange(
      restrictedChannels.map((rc) => (rc.channelId === channelId ? next : rc)),
    );
  };
  const removeRestrictedChannel = (channelId: string): void => {
    onRestrictedChannelsChange(restrictedChannels.filter((rc) => rc.channelId !== channelId));
  };
  const addRestrictedChannel = (channelId: string): void => {
    if (restrictedChannels.some((rc) => rc.channelId === channelId)) return;
    onRestrictedChannelsChange([...restrictedChannels, { channelId, modes: ['images'] }]);
  };

  return (
    <div className="space-y-6 py-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rôles bypass</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Les membres ayant l'un de ces rôles ne sont jamais évalués par l'automod. Utile pour tes
            modérateurs ou rôles privilégiés.
          </p>
          {roles.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-xs text-muted-foreground">
              Aucun rôle Discord disponible. Le bot doit être connecté pour lister les rôles.
            </p>
          ) : (
            <BypassRolesPicker
              roles={roles}
              selectedIds={bypassRoleIds}
              pending={pending}
              onChange={onBypassRoleIdsChange}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Salons restreints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Définit ce qui est autorisé dans un salon. Les messages non conformes sont supprimés{' '}
            <strong>avant</strong> toute autre règle automod, et même les rôles bypass ne sont pas
            exemptés (c'est une politique de canal, pas une sanction de comportement).
          </p>
          {channels.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-xs text-muted-foreground">
              Aucun salon Discord disponible. Le bot doit être connecté pour lister les salons.
            </p>
          ) : (
            <RestrictedChannelsSection
              channels={channels}
              restrictedChannels={restrictedChannels}
              pending={pending}
              onAdd={addRestrictedChannel}
              onUpdate={updateRestrictedChannel}
              onRemove={removeRestrictedChannel}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
