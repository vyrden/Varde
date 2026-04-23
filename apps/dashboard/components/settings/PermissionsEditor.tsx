'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import type { GuildRoleDto, PermissionDefinitionDto } from '../../lib/api-client';
import { bindPermission, unbindPermission } from '../../lib/permissions-actions';

/** Données d'une permission enrichies de ses bindings courants. */
export interface PermissionWithBindings {
  readonly definition: PermissionDefinitionDto;
  /** IDs des rôles actuellement liés à cette permission. */
  readonly boundRoleIds: readonly string[];
}

/** Données d'un module avec ses permissions et leurs bindings. */
export interface ModulePermissionsData {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly PermissionWithBindings[];
}

export interface PermissionsEditorProps {
  readonly guildId: string;
  readonly modules: readonly ModulePermissionsData[];
  readonly roles: readonly GuildRoleDto[];
}

interface PermissionRowState {
  readonly selectedRoleId: string;
  readonly pending: boolean;
  readonly error: string | null;
}

type RowKey = `${string}:${string}`;

const rowKey = (moduleId: string, permissionId: string): RowKey =>
  `${moduleId}:${permissionId}` as RowKey;

const defaultRowState = (): PermissionRowState => ({
  selectedRoleId: '',
  pending: false,
  error: null,
});

/**
 * Éditeur client des bindings permission → rôle. Chaque ligne de
 * permission affiche les rôles déjà liés (avec bouton "Retirer") et
 * un select pour en ajouter un nouveau. Les mutations appellent les
 * server actions `bindPermission` / `unbindPermission` et revalident
 * la page côté serveur.
 */
export function PermissionsEditor({
  guildId,
  modules,
  roles,
}: PermissionsEditorProps): ReactElement {
  // Copie locale des bindings pour réflexion immédiate sans rechargement.
  const [localBindings, setLocalBindings] = useState<Map<string, readonly string[]>>(() => {
    const map = new Map<string, readonly string[]>();
    for (const mod of modules) {
      for (const perm of mod.permissions) {
        map.set(rowKey(mod.id, perm.definition.id), perm.boundRoleIds);
      }
    }
    return map;
  });

  const [rowStates, setRowStates] = useState<Map<RowKey, PermissionRowState>>(() => new Map());

  const getRowState = (key: RowKey): PermissionRowState => rowStates.get(key) ?? defaultRowState();

  const setRowState = (key: RowKey, patch: Partial<PermissionRowState>): void => {
    setRowStates((prev) => {
      const next = new Map(prev);
      const current = next.get(key) ?? defaultRowState();
      next.set(key, { ...current, ...patch });
      return next;
    });
  };

  const getBoundRoles = (key: string): readonly string[] => localBindings.get(key) ?? [];

  const handleBind = async (moduleId: string, permissionId: string, key: RowKey): Promise<void> => {
    const state = getRowState(key);
    const roleId = state.selectedRoleId;
    if (!roleId) return;

    setRowState(key, { pending: true, error: null });
    const result = await bindPermission(guildId, moduleId, permissionId, roleId);

    if (result.ok) {
      setLocalBindings((prev) => {
        const next = new Map(prev);
        const current = next.get(key) ?? [];
        if (!current.includes(roleId)) {
          next.set(key, [...current, roleId]);
        }
        return next;
      });
      setRowState(key, { pending: false, selectedRoleId: '', error: null });
    } else {
      setRowState(key, { pending: false, error: result.error ?? 'Erreur inconnue' });
    }
  };

  const handleUnbind = async (
    moduleId: string,
    permissionId: string,
    key: RowKey,
    roleId: string,
  ): Promise<void> => {
    setRowState(key, { pending: true, error: null });
    const result = await unbindPermission(guildId, moduleId, permissionId, roleId);

    if (result.ok) {
      setLocalBindings((prev) => {
        const next = new Map(prev);
        const current = next.get(key) ?? [];
        next.set(
          key,
          current.filter((r) => r !== roleId),
        );
        return next;
      });
      setRowState(key, { pending: false, error: null });
    } else {
      setRowState(key, { pending: false, error: result.error ?? 'Erreur inconnue' });
    }
  };

  if (modules.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun module n'a déclaré de permission.</p>;
  }

  return (
    <div className="space-y-8">
      {modules.map((mod) => (
        <section key={mod.id} id={mod.id} aria-labelledby={`module-title-${mod.id}`}>
          <Card>
            <CardHeader>
              <CardTitle id={`module-title-${mod.id}`}>{mod.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {mod.permissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ce module ne déclare aucune permission.
                </p>
              ) : (
                mod.permissions.map((perm) => {
                  const key = rowKey(mod.id, perm.definition.id);
                  const state = getRowState(key);
                  const bound = getBoundRoles(key);
                  const unbound = roles.filter((r) => !bound.includes(r.id));

                  return (
                    <div key={perm.definition.id} className="rounded-md border p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium font-mono">{perm.definition.id}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {perm.definition.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Catégorie : {perm.definition.category} — niveau par défaut :{' '}
                          {perm.definition.defaultLevel}
                        </p>
                      </div>

                      {/* Rôles liés */}
                      <ul className="flex flex-wrap gap-2 items-center" aria-label="Rôles liés">
                        {bound.length === 0 ? (
                          <li className="text-xs text-muted-foreground italic">
                            Aucun rôle lié — les actions correspondantes seront refusées.
                          </li>
                        ) : (
                          bound.map((roleId) => {
                            const role = roles.find((r) => r.id === roleId);
                            return (
                              <li key={roleId}>
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  <span>{role?.name ?? roleId}</span>
                                  <button
                                    type="button"
                                    aria-label={`Retirer le rôle ${role?.name ?? roleId}`}
                                    disabled={state.pending}
                                    onClick={() =>
                                      void handleUnbind(mod.id, perm.definition.id, key, roleId)
                                    }
                                    className="ml-1 rounded-full hover:bg-destructive/20 focus:outline-none focus:ring-2 focus:ring-ring px-0.5 disabled:opacity-50"
                                  >
                                    ×
                                  </button>
                                </Badge>
                              </li>
                            );
                          })
                        )}
                      </ul>

                      {/* Ajout d'un rôle */}
                      <div className="flex items-center gap-2">
                        <label htmlFor={`role-select-${key}`} className="sr-only">
                          Ajouter un rôle à {perm.definition.id}
                        </label>
                        <select
                          id={`role-select-${key}`}
                          value={state.selectedRoleId}
                          disabled={state.pending || unbound.length === 0}
                          onChange={(e) => setRowState(key, { selectedRoleId: e.target.value })}
                          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <option value="">
                            {unbound.length === 0
                              ? 'Tous les rôles sont déjà liés'
                              : '+ Ajouter un rôle'}
                          </option>
                          {unbound.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          disabled={state.pending || !state.selectedRoleId || unbound.length === 0}
                          onClick={() => void handleBind(mod.id, perm.definition.id, key)}
                        >
                          {state.pending ? 'En cours…' : 'Lier'}
                        </Button>
                      </div>

                      {state.error !== null ? (
                        <p role="alert" className="text-sm text-destructive">
                          {state.error}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
