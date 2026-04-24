'use client';

import { Button } from '@varde/ui';

import type { ReactionRoleMessageClient } from './ReactionRolesConfigEditor';

export interface ReactionRolesListProps {
  readonly messages: readonly ReactionRoleMessageClient[];
  readonly channelNameById: Readonly<Record<string, string>>;
  readonly onAddNew: () => void;
  readonly onEdit: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

const MODE_LABEL: Record<string, { label: string; className: string }> = {
  normal: { label: 'Normal', className: 'bg-muted text-foreground' },
  unique: {
    label: 'Unique',
    className: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  },
  verifier: {
    label: 'Vérificateur',
    className: 'bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
  },
};

/**
 * Écran 1 : liste des messages reaction-roles existants pour une guild.
 */
export function ReactionRolesList({
  messages,
  channelNameById,
  onAddNew,
  onEdit,
  onDelete,
}: ReactionRolesListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Messages reaction-roles</h3>
          <p className="text-sm text-muted-foreground">
            {messages.length === 0
              ? 'Aucun message configuré.'
              : `${messages.length} message${messages.length > 1 ? 's' : ''} publié${messages.length > 1 ? 's' : ''} sur cette guild.`}
          </p>
        </div>
        <Button type="button" onClick={onAddNew}>
          + Nouveau reaction-role
        </Button>
      </div>

      {messages.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.4fr] gap-2 bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Label</div>
            <div>Salon</div>
            <div>Emojis</div>
            <div>Mode</div>
            <div />
          </div>
          {messages.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.4fr] items-center gap-2 border-t border-border px-3 py-3 text-sm"
            >
              <div className="font-semibold">{m.label}</div>
              <div className="text-sm">#{channelNameById[m.channelId] ?? m.channelId}</div>
              <div className="text-sm text-muted-foreground">
                {m.pairs
                  .map((p) => (p.emoji.type === 'unicode' ? p.emoji.value : `:${p.emoji.name}:`))
                  .join(' ')}
                <span className="ml-1 text-xs text-muted-foreground">({m.pairs.length})</span>
              </div>
              <div>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${MODE_LABEL[m.mode]?.className ?? ''}`}
                >
                  {MODE_LABEL[m.mode]?.label ?? m.mode}
                </span>
              </div>
              <div className="flex justify-end gap-1">
                <Button type="button" size="sm" variant="secondary" onClick={() => onEdit(m.id)}>
                  Éditer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => onDelete(m.id)}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
