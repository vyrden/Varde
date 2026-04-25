'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  InlineConfirm,
} from '@varde/ui';
import { useState } from 'react';

import type { ReactionRoleMessageClient } from './ReactionRolesConfigEditor';

export interface ReactionRolesListProps {
  readonly messages: readonly ReactionRoleMessageClient[];
  readonly channelNameById: Readonly<Record<string, string>>;
  readonly version: string;
  readonly isEnabled: boolean;
  readonly onAddNew: () => void;
  readonly onEdit: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

const MODE_VARIANT: Record<
  ReactionRoleMessageClient['mode'],
  { label: string; variant: 'inactive' | 'default' | 'active' }
> = {
  normal: { label: 'Normal', variant: 'inactive' },
  unique: { label: 'Unique', variant: 'default' },
  verifier: { label: 'Vérificateur', variant: 'active' },
};

/** Émojis à afficher avant le compteur `+N`. */
const EMOJI_DISPLAY_LIMIT = 4;

function PencilIcon() {
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

function TrashIcon() {
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

function SmilePlusIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="13" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 16c.8 1.2 2.3 2 4 2s3.2-.8 4-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10.5" cy="12" r="1" fill="currentColor" />
      <circle cx="15.5" cy="12" r="1" fill="currentColor" />
      <path d="M24 5v6M21 8h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Vue liste des reaction-roles d'une guild — Card avec table compacte
 * et sidebar « À propos ». Suppression confirmée inline (plus de
 * `confirm()` natif).
 */
export function ReactionRolesList({
  messages,
  channelNameById,
  version,
  isEnabled,
  onAddNew,
  onEdit,
  onDelete,
}: ReactionRolesListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const description =
    messages.length === 0
      ? 'Aucun message reaction-role configuré pour cette guild.'
      : `${messages.length} message${messages.length > 1 ? 's' : ''} publié${messages.length > 1 ? 's' : ''} sur cette guild.`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Messages reaction-roles</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Button type="button" size="sm" onClick={onAddNew}>
              + Nouveau reaction-role
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                <span className="opacity-40">
                  <SmilePlusIcon />
                </span>
                <p className="text-sm">Aucun reaction-role configuré.</p>
                <Button type="button" variant="outline" size="sm" onClick={onAddNew}>
                  + Créer un premier reaction-role
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left">
                  <thead className="bg-surface-active/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2">Salon</th>
                      <th className="px-3 py-2">Emojis</th>
                      <th className="px-3 py-2">Mode</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((m) => {
                      const channelName = channelNameById[m.channelId] ?? m.channelId;
                      const visiblePairs = m.pairs.slice(0, EMOJI_DISPLAY_LIMIT);
                      const overflow = m.pairs.length - visiblePairs.length;
                      const modeMeta = MODE_VARIANT[m.mode];
                      const isPendingDelete = pendingDeleteId === m.id;

                      return (
                        <tr key={m.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-3 text-sm font-medium text-foreground">
                            {m.label}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className="font-normal">
                              #{channelName}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {visiblePairs.map((p, idx) => (
                                <span
                                  // biome-ignore lint/suspicious/noArrayIndexKey: emojis can repeat, position is the stable key here
                                  key={`${m.id}-${idx}`}
                                  className="text-lg leading-none"
                                  title={
                                    p.emoji.type === 'unicode' ? p.emoji.value : `:${p.emoji.name}:`
                                  }
                                >
                                  {p.emoji.type === 'unicode' ? p.emoji.value : `:${p.emoji.name}:`}
                                </span>
                              ))}
                              {overflow > 0 ? (
                                <Badge variant="inactive" className="font-normal">
                                  +{overflow}
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={modeMeta.variant}>{modeMeta.label}</Badge>
                          </td>
                          <td className="px-3 py-3">
                            {isPendingDelete ? (
                              <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                                <span>Supprimer ?</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    onDelete(m.id);
                                    setPendingDeleteId(null);
                                  }}
                                >
                                  Confirmer
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPendingDeleteId(null)}
                                >
                                  Annuler
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onEdit(m.id)}
                                  aria-label={`Éditer ${m.label}`}
                                  title="Éditer"
                                >
                                  <PencilIcon />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPendingDeleteId(m.id)}
                                  aria-label={`Supprimer ${m.label}`}
                                  title="Supprimer"
                                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <TrashIcon />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pendingDeleteId !== null ? (
              <InlineConfirm
                message={
                  <>
                    Supprimer ce reaction-role ?{' '}
                    <strong>Le message Discord restera en place</strong> (le bot ne réagira
                    simplement plus à ses réactions).
                  </>
                }
                confirmLabel="Supprimer"
                onConfirm={() => {
                  onDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }}
                onCancel={() => setPendingDeleteId(null)}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">À propos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-foreground">v{version}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Statut</span>
              <div className="flex items-center gap-3">
                <span className="text-foreground">{isEnabled ? 'Actif' : 'Inactif'}</span>
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full opacity-50 ${
                    isEnabled ? 'bg-success' : 'bg-[#4e5058]'
                  }`}
                >
                  <span
                    className={`absolute top-0.75 left-0.75 h-4 w-4 rounded-full bg-white shadow ${
                      isEnabled ? 'translate-x-4.5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </div>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Permets à tes membres de s'auto-attribuer des rôles en cliquant sur des emojis.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
