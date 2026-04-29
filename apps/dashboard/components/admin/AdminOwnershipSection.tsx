'use client';

import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import type { AdminOwnerDto } from '../../lib/admin-api';
import {
  type AdminActionState,
  addAdminOwner,
  removeAdminOwner,
} from '../../lib/admin-ownership-actions';

/**
 * Section unique de `/admin/ownership` (jalon 7 PR 7.2 sub-livrable
 * 7e). Combine la liste des owners et le formulaire d'ajout.
 *
 * Garde-fou « dernier owner » : le bouton « Retirer » est masqué
 * quand il ne reste qu'un seul owner. La même garde existe côté
 * API (`409 last_owner`) — on compte sur les deux.
 *
 * Pas de transfert dédié dans cette PR : « ajouter un nouvel owner
 * puis retirer l'ancien » couvre le besoin sans introduire un
 * nouvel endpoint. La modale de transfert pourra arriver dans une
 * itération ultérieure si l'UX le justifie.
 */

export interface AdminOwnershipCopy {
  readonly listHeading: string;
  readonly listDescription: string;
  readonly empty: string;
  readonly grantedAtLabel: string;
  readonly grantedByLabel: string;
  readonly grantedByAuto: string;
  readonly removeButton: string;
  readonly removeConfirm: string;
  readonly addHeading: string;
  readonly addDescription: string;
  readonly userIdLabel: string;
  readonly userIdPlaceholder: string;
  readonly addSubmit: string;
  readonly addSuccess: string;
  readonly removeSuccess: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initialAdd: AdminActionState = { kind: 'idle' };
const initialRemove: AdminActionState = { kind: 'idle' };

const formatGrantedAt = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export interface AdminOwnershipSectionProps {
  readonly owners: readonly AdminOwnerDto[];
  readonly currentUserDiscordId: string | null;
  readonly copy: AdminOwnershipCopy;
}

export function AdminOwnershipSection({
  owners,
  currentUserDiscordId,
  copy,
}: AdminOwnershipSectionProps): ReactElement {
  const [addState, addAction, addPending] = useActionState(addAdminOwner, initialAdd);
  const [removeState, removeAction, removePending] = useActionState(
    removeAdminOwner,
    initialRemove,
  );
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [discordUserId, setDiscordUserId] = useState('');

  const isLastOwner = owners.length <= 1;

  const errorState =
    removeState.kind === 'error' ? removeState : addState.kind === 'error' ? addState : null;
  const errorMessage =
    errorState !== null ? (copy.errors[errorState.code] ?? errorState.message) : null;

  return (
    <div className="space-y-4">
      <section
        className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
        aria-labelledby="admin-ownership-list-heading"
      >
        <header className="mb-3">
          <h2 id="admin-ownership-list-heading" className="text-base font-semibold text-foreground">
            {copy.listHeading}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.listDescription}</p>
        </header>

        {owners.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="admin-ownership-empty">
            {copy.empty}
          </p>
        ) : (
          <ul className="divide-y divide-border-muted rounded-md border border-border-muted">
            {owners.map((owner) => {
              const isSelf = owner.discordUserId === currentUserDiscordId;
              const showRemove = !isLastOwner;
              return (
                <li
                  key={owner.discordUserId}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                  data-testid={`admin-owner-${owner.discordUserId}`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground">
                      {owner.discordUserId}
                      {isSelf ? (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          you
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {copy.grantedAtLabel} : {formatGrantedAt(owner.grantedAt)} ·{' '}
                      {copy.grantedByLabel} : {owner.grantedByDiscordUserId ?? copy.grantedByAuto}
                    </p>
                  </div>
                  {showRemove ? (
                    <form action={removeAction}>
                      <input type="hidden" name="discordUserId" value={owner.discordUserId} />
                      <button
                        type="submit"
                        disabled={removePending}
                        onClick={(e) => {
                          if (!window.confirm(copy.removeConfirm)) {
                            e.preventDefault();
                            return;
                          }
                          setPendingRemoveId(owner.discordUserId);
                        }}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-rose-500/40 px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid={`admin-owner-remove-${owner.discordUserId}`}
                      >
                        {removePending && pendingRemoveId === owner.discordUserId
                          ? '…'
                          : copy.removeButton}
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
        aria-labelledby="admin-ownership-add-heading"
      >
        <header className="mb-3">
          <h2 id="admin-ownership-add-heading" className="text-base font-semibold text-foreground">
            {copy.addHeading}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.addDescription}</p>
        </header>
        <form action={addAction} className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-ownership-add-id"
              className="block text-sm font-medium text-foreground"
            >
              {copy.userIdLabel}
            </label>
            <input
              id="admin-ownership-add-id"
              name="discordUserId"
              value={discordUserId}
              onChange={(e) => setDiscordUserId(e.target.value)}
              placeholder={copy.userIdPlaceholder}
              inputMode="numeric"
              className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={addPending || discordUserId.length === 0}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="admin-ownership-add-submit"
            >
              {addPending ? '…' : copy.addSubmit}
            </button>
          </div>
        </form>
      </section>

      {errorMessage !== null ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          role="alert"
          data-testid="admin-ownership-error"
        >
          {errorMessage}
        </div>
      ) : null}
      {addState.kind === 'success' ? (
        <div
          className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          role="status"
          data-testid="admin-ownership-add-success"
        >
          {copy.addSuccess}
        </div>
      ) : null}
      {removeState.kind === 'success' ? (
        <div
          className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          role="status"
          data-testid="admin-ownership-remove-success"
        >
          {copy.removeSuccess}
        </div>
      ) : null}
    </div>
  );
}
