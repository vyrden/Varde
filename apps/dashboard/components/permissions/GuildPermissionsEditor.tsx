'use client';

import type { ReactElement } from 'react';
import { useActionState, useMemo, useState } from 'react';

import type {
  EnrichedGuildRoleDto,
  GuildPermissionsConfigDto,
  GuildPermissionsPreviewDto,
} from '../../lib/api-client';
import {
  type GuildPermissionsActionState,
  previewGuildPermissions,
  saveGuildPermissions,
} from '../../lib/guild-permissions-actions';
import { RoleMultiSelect, type RoleMultiSelectCopy } from './RoleMultiSelect';

/**
 * Éditeur des permissions par-guild (jalon 7 PR 7.3 sub-livrable 8).
 *
 * Layout : deux blocs verticaux empilés (admin / moderator), chacun
 * avec un `RoleMultiSelect` indépendant. Le bouton « Enregistrer »
 * envoie le patch combiné via `saveGuildPermissions`. « Voir qui
 * aurait accès » lance `previewGuildPermissions` et affiche les
 * membres bucketés par niveau dans un panneau dépliable sous le
 * bouton.
 *
 * Garde-fous client (le service backend revalide tout) :
 *
 * - Bouton « Enregistrer » désactivé tant que `adminRoleIds` est
 *   vide (le service refuserait avec `invalid_permissions` 422).
 * - Avertissement explicite si l'admin retire un rôle qu'il porte
 *   lui-même — `currentUserRoleIds` est passé en prop pour ce check.
 *   La modale dédiée (`RoleRemovalConfirmModal`) viendra dans une
 *   itération ultérieure ; pour l'instant on se contente d'un
 *   `window.confirm` natif.
 */

export interface GuildPermissionsEditorCopy {
  readonly adminHeading: string;
  readonly adminDescription: string;
  readonly moderatorHeading: string;
  readonly moderatorDescription: string;
  readonly saveButton: string;
  readonly previewButton: string;
  readonly successMessage: string;
  readonly emptyAdminWarning: string;
  readonly removeSelfWarning: string;
  readonly previewHeading: string;
  readonly previewAdminsLabel: string;
  readonly previewModeratorsLabel: string;
  readonly previewEmpty: string;
  readonly errors: Readonly<Record<string, string>>;
  readonly roleMultiSelect: RoleMultiSelectCopy;
}

export interface GuildPermissionsEditorProps {
  readonly guildId: string;
  readonly initial: GuildPermissionsConfigDto;
  /** Rôles que l'utilisateur courant porte sur la guild (pour l'avertissement « retirer son propre accès »). */
  readonly currentUserRoleIds: readonly string[];
  readonly copy: GuildPermissionsEditorCopy;
}

const initialSave: GuildPermissionsActionState<GuildPermissionsConfigDto> = { kind: 'idle' };
const initialPreview: GuildPermissionsActionState<GuildPermissionsPreviewDto> = { kind: 'idle' };

const formatRoleNames = (
  roleIds: readonly string[],
  roles: readonly EnrichedGuildRoleDto[],
): string => {
  const byId = new Map(roles.map((r) => [r.id, r.name]));
  return roleIds.map((id) => byId.get(id) ?? id).join(', ');
};

export function GuildPermissionsEditor({
  guildId,
  initial,
  currentUserRoleIds,
  copy,
}: GuildPermissionsEditorProps): ReactElement {
  const [adminRoleIds, setAdminRoleIds] = useState<readonly string[]>(initial.adminRoleIds);
  const [moderatorRoleIds, setModeratorRoleIds] = useState<readonly string[]>(
    initial.moderatorRoleIds,
  );
  const [saveState, saveAction, savePending] = useActionState(saveGuildPermissions, initialSave);
  const [previewState, previewAction, previewPending] = useActionState(
    previewGuildPermissions,
    initialPreview,
  );

  const userRoleSet = useMemo(() => new Set(currentUserRoleIds), [currentUserRoleIds]);
  const removingSelfAdmin = useMemo(() => {
    // Vrai si l'admin a actuellement un rôle dans `initial.adminRoleIds`
    // qui n'est plus dans la nouvelle sélection.
    return initial.adminRoleIds.some((id) => userRoleSet.has(id) && !adminRoleIds.includes(id));
  }, [initial.adminRoleIds, userRoleSet, adminRoleIds]);

  const handleSave = (formData: FormData): void => {
    if (removingSelfAdmin) {
      // eslint-disable-next-line no-alert -- modale dédiée prévue en itération ultérieure
      const ok = window.confirm(copy.removeSelfWarning);
      if (!ok) return;
    }
    formData.set('guildId', guildId);
    formData.set('adminRoleIds', adminRoleIds.join(','));
    formData.set('moderatorRoleIds', moderatorRoleIds.join(','));
    saveAction(formData);
  };

  const handlePreview = (formData: FormData): void => {
    formData.set('guildId', guildId);
    formData.set('adminRoleIds', adminRoleIds.join(','));
    formData.set('moderatorRoleIds', moderatorRoleIds.join(','));
    previewAction(formData);
  };

  const isAdminEmpty = adminRoleIds.length === 0;
  const errorMessage =
    saveState.kind === 'error'
      ? (copy.errors[saveState.code] ?? saveState.message)
      : previewState.kind === 'error'
        ? (copy.errors[previewState.code] ?? previewState.message)
        : null;

  return (
    <div className="space-y-6">
      <section
        className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
        aria-labelledby="permissions-admin-heading"
      >
        <header className="mb-3">
          <h2 id="permissions-admin-heading" className="text-base font-semibold text-foreground">
            {copy.adminHeading}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.adminDescription}</p>
        </header>
        <RoleMultiSelect
          roles={initial.roles}
          selected={adminRoleIds}
          onChange={setAdminRoleIds}
          copy={copy.roleMultiSelect}
          ariaLabel={copy.adminHeading}
          testIdPrefix="permissions-admin"
        />
        {isAdminEmpty ? (
          <p
            className="mt-2 text-xs text-rose-600 dark:text-rose-400"
            data-testid="permissions-admin-empty-warning"
          >
            {copy.emptyAdminWarning}
          </p>
        ) : null}
      </section>

      <section
        className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
        aria-labelledby="permissions-moderator-heading"
      >
        <header className="mb-3">
          <h2
            id="permissions-moderator-heading"
            className="text-base font-semibold text-foreground"
          >
            {copy.moderatorHeading}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.moderatorDescription}</p>
        </header>
        <RoleMultiSelect
          roles={initial.roles}
          selected={moderatorRoleIds}
          onChange={setModeratorRoleIds}
          copy={copy.roleMultiSelect}
          ariaLabel={copy.moderatorHeading}
          testIdPrefix="permissions-moderator"
        />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <form action={handlePreview}>
          <button
            type="submit"
            disabled={previewPending || isAdminEmpty}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="permissions-preview-button"
          >
            {previewPending ? '…' : copy.previewButton}
          </button>
        </form>
        <form action={handleSave}>
          <button
            type="submit"
            disabled={savePending || isAdminEmpty}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="permissions-save-button"
          >
            {savePending ? '…' : copy.saveButton}
          </button>
        </form>
      </div>

      {errorMessage !== null ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          role="alert"
          data-testid="permissions-error"
        >
          {errorMessage}
        </div>
      ) : null}

      {saveState.kind === 'success' ? (
        <div
          className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          role="status"
          data-testid="permissions-save-success"
        >
          {copy.successMessage}
        </div>
      ) : null}

      {previewState.kind === 'success' ? (
        <section
          className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
          aria-labelledby="permissions-preview-heading"
          data-testid="permissions-preview-results"
        >
          <h3
            id="permissions-preview-heading"
            className="mb-3 text-base font-semibold text-foreground"
          >
            {copy.previewHeading}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                {copy.previewAdminsLabel} ({previewState.data.admins.length})
              </h4>
              {previewState.data.admins.length === 0 ? (
                <p className="text-xs text-muted-foreground">{copy.previewEmpty}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {previewState.data.admins.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      {m.avatarUrl !== null && m.avatarUrl !== undefined ? (
                        // biome-ignore lint/performance/noImgElement: avatar Discord externe
                        <img
                          src={m.avatarUrl}
                          alt=""
                          className="size-5 rounded-full border border-border-muted"
                        />
                      ) : null}
                      <span className="font-medium text-foreground">{m.username ?? m.id}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatRoleNames(m.grantedBy, initial.roles)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                {copy.previewModeratorsLabel} ({previewState.data.moderators.length})
              </h4>
              {previewState.data.moderators.length === 0 ? (
                <p className="text-xs text-muted-foreground">{copy.previewEmpty}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {previewState.data.moderators.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      {m.avatarUrl !== null && m.avatarUrl !== undefined ? (
                        // biome-ignore lint/performance/noImgElement: avatar Discord externe
                        <img
                          src={m.avatarUrl}
                          alt=""
                          className="size-5 rounded-full border border-border-muted"
                        />
                      ) : null}
                      <span className="font-medium text-foreground">{m.username ?? m.id}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatRoleNames(m.grantedBy, initial.roles)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
