'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import type { ReactElement } from 'react';

import type { AuditLogItemDto } from '../../../lib/api-client';
import { AuditView } from '../../audit/AuditView';

export interface HistoryTabProps {
  readonly guildId: string;
  readonly initialItems: readonly AuditLogItemDto[];
  readonly initialNextCursor: string | undefined;
  readonly knownActions: readonly string[];
}

/**
 * Tab « Historique ». Wrapper autour de l'`AuditView` filtré par
 * `moduleId='moderation'`. Tab read-only — pas de StickyActionBar
 * côté shell.
 *
 * Le filtre `lockedFilters={moduleId:'moderation'}` est passé à
 * `AuditView` pour qu'il survive aux resets utilisateur (filtre
 * non éditable depuis l'UI).
 */
export function HistoryTab({
  guildId,
  initialItems,
  initialNextCursor,
  knownActions,
}: HistoryTabProps): ReactElement {
  return (
    <div className="space-y-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des sanctions</CardTitle>
          <p className="text-xs text-muted-foreground">
            Toutes les actions de modération (manuelles + automatiques) sont auditées et
            consultables ici. Les anciennes infractions sont aussi accessibles via{' '}
            <code>/infractions @user</code> et <code>/case &lt;ulid&gt;</code> dans Discord.
          </p>
        </CardHeader>
        <CardContent>
          <AuditView
            guildId={guildId}
            initialItems={initialItems}
            initialNextCursor={initialNextCursor}
            initialFilters={{}}
            knownActions={knownActions}
            lockedFilters={{ moduleId: 'moderation' }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
