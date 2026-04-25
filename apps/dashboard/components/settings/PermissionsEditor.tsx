'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@varde/ui';
import { type ReactElement, useMemo, useState } from 'react';

import type { GuildRoleDto, PermissionDefinitionDto } from '../../lib/api-client';
import { bindPermission, unbindPermission } from '../../lib/permissions-actions';
import { moduleIcon } from '../shell/module-icons';
import { RoleCombobox } from './RoleCombobox';
import { roleColorHex } from './role-colors';

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

interface RowState {
  readonly pending: boolean;
  readonly error: string | null;
}

type RowKey = `${string}:${string}`;
const rowKey = (moduleId: string, permissionId: string): RowKey =>
  `${moduleId}:${permissionId}` as RowKey;
const defaultRowState = (): RowState => ({ pending: false, error: null });

type CategoryFilter = 'all' | string;

const CATEGORY_BADGE: Record<string, 'default' | 'active' | 'warning' | 'inactive' | 'outline'> = {
  config: 'default',
  utility: 'active',
};

const LEVEL_BADGE: Record<
  PermissionDefinitionDto['defaultLevel'],
  { variant: 'danger' | 'warning' | 'inactive' | 'outline'; label: string }
> = {
  admin: { variant: 'danger', label: 'admin' },
  moderator: { variant: 'warning', label: 'moderator' },
  member: { variant: 'inactive', label: 'member' },
  nobody: { variant: 'outline', label: 'nobody' },
};

interface RoleChipProps {
  readonly role: GuildRoleDto;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}

function RoleChip({ role, disabled, onRemove }: RoleChipProps): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-active px-2 py-1 text-xs font-medium text-foreground">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: roleColorHex(role.id) }}
      />
      <span className="max-w-48 truncate">{role.name}</span>
      <button
        type="button"
        aria-label={`Retirer ${role.name}`}
        disabled={disabled}
        onClick={onRemove}
        className="ml-0.5 rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M3 3l6 6M9 3l-6 6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

interface PermissionRowProps {
  readonly permission: PermissionWithBindings;
  readonly boundRoleIds: readonly string[];
  readonly roles: readonly GuildRoleDto[];
  readonly state: RowState;
  readonly onBind: (roleId: string) => void;
  readonly onUnbind: (roleId: string) => void;
}

function PermissionRow({
  permission,
  boundRoleIds,
  roles,
  state,
  onBind,
  onUnbind,
}: PermissionRowProps): ReactElement {
  const def = permission.definition;
  const categoryVariant = CATEGORY_BADGE[def.category] ?? 'outline';
  const levelMeta = LEVEL_BADGE[def.defaultLevel];
  const hasNoBindings = boundRoleIds.length === 0;

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-sm text-foreground">{def.id}</code>
          <Badge variant={categoryVariant} className="text-[9px]">
            {def.category}
          </Badge>
          <Badge variant={levelMeta.variant} className="text-[9px]">
            {levelMeta.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{def.description}</p>
      </div>

      {hasNoBindings ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 1.5L13 12H1L7 1.5zM7 5.5v3M7 10v.1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Aucun rôle lié — toutes les actions correspondantes sont refusées.</span>
        </div>
      ) : (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Rôles autorisés">
          {boundRoleIds.map((roleId) => {
            const role = roles.find((r) => r.id === roleId) ?? { id: roleId, name: roleId };
            return (
              <li key={roleId}>
                <RoleChip role={role} disabled={state.pending} onRemove={() => onUnbind(roleId)} />
              </li>
            );
          })}
        </ul>
      )}

      <RoleCombobox
        roles={roles}
        excludeIds={boundRoleIds}
        onSelect={(roleId) => onBind(roleId)}
        disabled={state.pending}
        placeholder="+ Ajouter un rôle"
        ariaLabel={`Ajouter un rôle à ${def.id}`}
      />

      {state.error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

interface SidebarStatsProps {
  readonly totalPermissions: number;
  readonly unboundPermissions: number;
  readonly modulesCount: number;
}

function SidebarStats({
  totalPermissions,
  unboundPermissions,
  modulesCount,
}: SidebarStatsProps): ReactElement {
  const configured = totalPermissions - unboundPermissions;
  const ratio = totalPermissions === 0 ? 0 : Math.round((configured / totalPermissions) * 100);

  return (
    <div className="sticky top-6 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Permissions configurées</span>
              <span className="font-mono text-foreground">
                {configured} / {totalPermissions}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-active">
              <div
                aria-hidden="true"
                className="h-full bg-primary transition-all duration-150 ease-out"
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>
          {unboundPermissions > 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M7 1.5L13 12H1L7 1.5zM7 5.5v3M7 10v.1"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                {unboundPermissions} permission{unboundPermissions > 1 ? 's' : ''} sans rôle lié
              </span>
            </div>
          ) : (
            <p className="text-xs text-success">Toutes les permissions sont configurées.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Niveaux par défaut</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant="danger" className="shrink-0 text-[9px]">
              admin
            </Badge>
            <span>Réservé aux administrateurs.</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="warning" className="shrink-0 text-[9px]">
              moderator
            </Badge>
            <span>Modérateurs et plus.</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="inactive" className="shrink-0 text-[9px]">
              member
            </Badge>
            <span>Tous les membres.</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="shrink-0 text-[9px]">
              nobody
            </Badge>
            <span>Personne par défaut — opt-in explicite requis.</span>
          </div>
          <p className="pt-1.5 text-xs text-muted-foreground">
            Une permission sans rôle lié est bloquée pour tous, indépendamment du niveau par défaut.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">À propos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Modules actifs</span>
            <span className="font-mono text-foreground">{modulesCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Permissions</span>
            <span className="font-mono text-foreground">{totalPermissions}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Les rôles liés sont vérifiés à chaque appel de commande.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Éditeur des bindings permission → rôle pour une guild. Layout 2
 * colonnes : main (recherche + filtres + liste des modules), sidebar
 * (résumé de configuration + légende + à propos). Les mutations
 * appellent les server actions `bindPermission` / `unbindPermission`
 * et patch l'état local pour un retour visuel immédiat sans reload.
 */
export function PermissionsEditor({
  guildId,
  modules,
  roles,
}: PermissionsEditorProps): ReactElement {
  const [localBindings, setLocalBindings] = useState<Map<string, readonly string[]>>(() => {
    const map = new Map<string, readonly string[]>();
    for (const mod of modules) {
      for (const perm of mod.permissions) {
        map.set(rowKey(mod.id, perm.definition.id), perm.boundRoleIds);
      }
    }
    return map;
  });
  const [rowStates, setRowStates] = useState<Map<RowKey, RowState>>(() => new Map());
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const getRowState = (key: RowKey): RowState => rowStates.get(key) ?? defaultRowState();

  const setRowState = (key: RowKey, patch: Partial<RowState>): void => {
    setRowStates((prev) => {
      const next = new Map(prev);
      const current = next.get(key) ?? defaultRowState();
      next.set(key, { ...current, ...patch });
      return next;
    });
  };

  const getBoundRoles = (key: string): readonly string[] => localBindings.get(key) ?? [];

  const handleBind = async (
    moduleId: string,
    permissionId: string,
    roleId: string,
  ): Promise<void> => {
    const key = rowKey(moduleId, permissionId);
    setRowState(key, { pending: true, error: null });
    const result = await bindPermission(guildId, moduleId, permissionId, roleId);
    if (result.ok) {
      setLocalBindings((prev) => {
        const next = new Map(prev);
        const current = next.get(key) ?? [];
        if (!current.includes(roleId)) next.set(key, [...current, roleId]);
        return next;
      });
      setRowState(key, { pending: false, error: null });
    } else {
      setRowState(key, { pending: false, error: result.error ?? 'Erreur inconnue' });
    }
  };

  const handleUnbind = async (
    moduleId: string,
    permissionId: string,
    roleId: string,
  ): Promise<void> => {
    const key = rowKey(moduleId, permissionId);
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

  // Catégories uniques observées dans les permissions, triées.
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const mod of modules) {
      for (const perm of mod.permissions) set.add(perm.definition.category);
    }
    return Array.from(set).sort();
  }, [modules]);

  // Filtrage : recherche (id ou description), module, catégorie.
  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules
      .filter((m) => moduleFilter === 'all' || m.id === moduleFilter)
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter((p) => {
          if (categoryFilter !== 'all' && p.definition.category !== categoryFilter) return false;
          if (q.length === 0) return true;
          return (
            p.definition.id.toLowerCase().includes(q) ||
            p.definition.description.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [modules, search, moduleFilter, categoryFilter]);

  // Stats globales (sur toutes les permissions, pas filtrées).
  const stats = useMemo(() => {
    let total = 0;
    let unbound = 0;
    for (const mod of modules) {
      for (const perm of mod.permissions) {
        total += 1;
        const bindings = localBindings.get(rowKey(mod.id, perm.definition.id)) ?? [];
        if (bindings.length === 0) unbound += 1;
      }
    }
    return { total, unbound, modulesCount: modules.length };
  }, [modules, localBindings]);

  if (modules.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun module n'a déclaré de permission.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M10.5 10.5L13 13"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une permission…"
              aria-label="Rechercher une permission"
              className="pl-9"
            />
          </div>
          <Select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            aria-label="Filtrer par module"
            wrapperClassName="sm:w-48"
          >
            <option value="all">Tous les modules</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrer par catégorie"
            wrapperClassName="sm:w-44"
          >
            <option value="all">Toutes catégories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        {filteredModules.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aucune permission ne correspond à ces filtres.
          </div>
        ) : (
          filteredModules.map((mod) => (
            <Card key={mod.id} id={mod.id}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  {moduleIcon(mod.id, 16)}
                </span>
                <div className="flex flex-1 items-center justify-between gap-2">
                  <CardTitle className="text-base">{mod.name}</CardTitle>
                  <Badge variant="inactive" className="text-[9px]">
                    {mod.permissions.length} perm{mod.permissions.length > 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {mod.permissions.map((perm) => {
                  const key = rowKey(mod.id, perm.definition.id);
                  return (
                    <PermissionRow
                      key={perm.definition.id}
                      permission={perm}
                      boundRoleIds={getBoundRoles(key)}
                      roles={roles}
                      state={getRowState(key)}
                      onBind={(roleId) => void handleBind(mod.id, perm.definition.id, roleId)}
                      onUnbind={(roleId) => void handleUnbind(mod.id, perm.definition.id, roleId)}
                    />
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <aside className="lg:col-span-1">
        <SidebarStats
          totalPermissions={stats.total}
          unboundPermissions={stats.unbound}
          modulesCount={stats.modulesCount}
        />
      </aside>
    </div>
  );
}
