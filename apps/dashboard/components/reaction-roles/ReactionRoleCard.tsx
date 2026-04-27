'use client';

import { Badge, Button, Card, CardContent, InlineConfirm } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import { isEmojiAvailable, isRoleAvailable } from './editor/editor-helpers';
import type {
  EmojiCatalog,
  ReactionRoleMessageClient,
  ReactionRolePairClient,
  RoleOption,
} from './types';

const MODE_VARIANT: Record<
  ReactionRoleMessageClient['mode'],
  { label: string; variant: 'inactive' | 'default' | 'active' }
> = {
  normal: { label: 'Normal', variant: 'inactive' },
  unique: { label: 'Unique', variant: 'default' },
  verifier: { label: 'Vérificateur', variant: 'active' },
};

const EMOJI_DISPLAY_LIMIT = 6;

function PencilIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.7 8h5.6l.7-8M6 6.5v4M8 6.5v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface ReactionRoleCardProps {
  readonly message: ReactionRoleMessageClient;
  readonly channelName: string;
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/** Sérialise une emoji structurée en texte brut accepté par les helpers. */
const serializePairEmoji = (emoji: ReactionRolePairClient['emoji']): string => {
  if (emoji.type === 'unicode') return emoji.value;
  const prefix = emoji.animated ? '<a:' : '<:';
  return `${prefix}${emoji.name}:${emoji.id}>`;
};

/**
 * Card unitaire pour un message reaction-role dans la landing.
 * Densité moyenne : label en titre, salon + nombre d'éléments + mode
 * en sous-info, échantillon d'emojis, actions à droite.
 *
 * Suppression confirmée inline via `<InlineConfirm>` au lieu d'un
 * `confirm()` natif — cohérent avec le pattern Moderation/Logs.
 */
export function ReactionRoleCard({
  message,
  channelName,
  roles,
  emojis,
  onEdit,
  onDelete,
}: ReactionRoleCardProps): ReactElement {
  const [pendingDelete, setPendingDelete] = useState(false);

  const visiblePairs = message.pairs.slice(0, EMOJI_DISPLAY_LIMIT);
  const overflow = message.pairs.length - visiblePairs.length;
  const modeMeta = MODE_VARIANT[message.mode];
  const reactionCount = message.pairs.filter((p) => p.kind === 'reaction').length;
  const buttonCount = message.pairs.filter((p) => p.kind === 'button').length;
  const orphanEmojiCount = message.pairs.filter(
    (p) => !isEmojiAvailable(serializePairEmoji(p.emoji), emojis),
  ).length;
  const missingRoleCount = message.pairs.filter((p) => !isRoleAvailable(p.roleId, roles)).length;
  const hasIssues = orphanEmojiCount > 0 || missingRoleCount > 0;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{message.label}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-normal">
                #{channelName}
              </Badge>
              <span>·</span>
              <span>
                {message.pairs.length} élément{message.pairs.length > 1 ? 's' : ''}
                {buttonCount > 0
                  ? ` (${reactionCount} réaction${reactionCount > 1 ? 's' : ''}, ${buttonCount} bouton${buttonCount > 1 ? 's' : ''})`
                  : ''}
              </span>
              <span>·</span>
              <Badge variant={modeMeta.variant}>{modeMeta.label}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {pendingDelete ? null : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onEdit}
                  aria-label={`Éditer ${message.label}`}
                  title="Éditer"
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setPendingDelete(true)}
                  aria-label={`Supprimer ${message.label}`}
                  title="Supprimer"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <TrashIcon />
                </Button>
              </>
            )}
          </div>
        </div>

        {visiblePairs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {visiblePairs.map((p, idx) => {
              const orphan = !isEmojiAvailable(serializePairEmoji(p.emoji), emojis);
              const display = p.emoji.type === 'unicode' ? p.emoji.value : `:${p.emoji.name}:`;
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: emojis can repeat, position is the stable key here
                  key={`${message.id}-${idx}`}
                  className={`text-base leading-none ${
                    orphan
                      ? 'rounded-sm bg-amber-100 px-1 outline-1 outline-amber-300 dark:bg-amber-950 dark:outline-amber-700'
                      : ''
                  }`}
                  title={
                    orphan
                      ? `${display} — emoji indisponible (serveur d'origine inaccessible)`
                      : display
                  }
                >
                  {display}
                </span>
              );
            })}
            {overflow > 0 ? (
              <Badge variant="inactive" className="font-normal">
                +{overflow}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {hasIssues
          ? (() => {
              const parts: string[] = [];
              if (orphanEmojiCount > 0) {
                parts.push(
                  `${orphanEmojiCount} emoji${orphanEmojiCount > 1 ? 's' : ''} indisponible${orphanEmojiCount > 1 ? 's' : ''}`,
                );
              }
              if (missingRoleCount > 0) {
                parts.push(
                  `${missingRoleCount} rôle${missingRoleCount > 1 ? 's' : ''} introuvable${missingRoleCount > 1 ? 's' : ''}`,
                );
              }
              return (
                <p
                  role="status"
                  className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                >
                  {`⚠ ${parts.join(' · ')}. Édite ce reaction-role pour corriger.`}
                </p>
              );
            })()
          : null}

        {pendingDelete ? (
          <InlineConfirm
            message={
              <>
                Supprimer ce reaction-role ? <strong>Le message Discord restera en place</strong>{' '}
                (le bot ne réagira simplement plus à ses réactions).
              </>
            }
            confirmLabel="Supprimer"
            onConfirm={() => {
              onDelete();
              setPendingDelete(false);
            }}
            onCancel={() => setPendingDelete(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
