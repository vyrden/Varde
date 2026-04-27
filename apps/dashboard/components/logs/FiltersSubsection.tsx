'use client';

import { Input, Label } from '@varde/ui';
import { type ReactElement, useState } from 'react';

import { EntityMultiPicker } from '../shared/EntityMultiPicker';
import type { ChannelOption, LogsExclusionsClient, RoleOption } from './LogsConfigEditor';

/**
 * Sous-section « Filtres globaux » de la configuration avancée.
 * Exclut certains utilisateurs / rôles / salons / bots du log.
 *
 * Refonte UI vs l'ancien `ExclusionsEditor` :
 * - Le `<select multiple>` natif (rôles, salons) est remplacé par
 *   `<EntityMultiPicker>` (chips + popover de recherche). Plus
 *   utilisable, surtout sur mobile.
 * - Le textarea utilisateurs reste — on entre des IDs Discord, pas
 *   des entités d'une liste connue (les membres ne sont pas pré-fetchés).
 */

/**
 * Extrait un userId depuis "<@123>", "<@!123>" ou "123" (snowflake brut).
 * Retourne null si le format est invalide.
 */
export function parseUserIdInput(raw: string): string | null {
  const mentionMatch = /^<@!?(\d{17,19})>$/.exec(raw.trim());
  if (mentionMatch) return mentionMatch[1] ?? null;
  const snowflake = /^\d{17,19}$/.exec(raw.trim());
  if (snowflake) return raw.trim();
  return null;
}

/** Parse une liste d'entrées séparées par virgule. */
export function parseUserIdList(input: string): {
  readonly ok: readonly string[];
  readonly invalid: readonly string[];
} {
  const parts = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    const id = parseUserIdInput(part);
    if (id !== null) {
      ok.push(id);
    } else {
      invalid.push(part);
    }
  }
  return { ok, invalid };
}

export interface FiltersSubsectionProps {
  readonly exclusions: LogsExclusionsClient;
  readonly roles: readonly RoleOption[];
  readonly channels: readonly ChannelOption[];
  readonly onChange: (exclusions: LogsExclusionsClient) => void;
  readonly pending?: boolean;
}

export function FiltersSubsection({
  exclusions,
  roles,
  channels,
  onChange,
  pending = false,
}: FiltersSubsectionProps): ReactElement {
  const [usersRaw, setUsersRaw] = useState<string>(exclusions.userIds.join(', '));
  const [usersInvalid, setUsersInvalid] = useState<readonly string[]>([]);

  const handleUsersBlur = (): void => {
    const { ok, invalid } = parseUserIdList(usersRaw);
    setUsersInvalid(invalid);
    onChange({ ...exclusions, userIds: ok });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Label htmlFor="excl-users">Utilisateurs exclus</Label>
        <Input
          id="excl-users"
          type="text"
          value={usersRaw}
          onChange={(e) => {
            setUsersRaw(e.target.value);
            setUsersInvalid([]);
          }}
          onBlur={handleUsersBlur}
          placeholder="<@123456789>, 987654321"
          className={usersInvalid.length > 0 ? 'border-destructive' : ''}
          aria-label="Utilisateurs exclus — mentions Discord ou IDs numériques, séparés par des virgules"
          aria-describedby="excl-users-help excl-users-error"
          disabled={pending}
        />
        {usersInvalid.length > 0 ? (
          <p id="excl-users-error" className="text-xs text-destructive" role="alert">
            Format invalide : copie-colle une mention Discord (@nom) ou un ID numérique.{' '}
            <span className="font-medium">Ignorés : {usersInvalid.join(', ')}</span>
          </p>
        ) : null}
        {exclusions.userIds.length > 0 && usersInvalid.length === 0 ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {exclusions.userIds.length} utilisateur{exclusions.userIds.length > 1 ? 's' : ''} exclu
            {exclusions.userIds.length > 1 ? 's' : ''}.
          </p>
        ) : null}
        <p id="excl-users-help" className="text-xs text-muted-foreground">
          Mode développeur Discord puis clic droit → Copier l'ID. Mentions ou IDs séparés par
          virgules.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Rôles exclus</Label>
        <EntityMultiPicker
          entityKind="role"
          entities={roles}
          selectedIds={exclusions.roleIds}
          pending={pending}
          onChange={(next) => onChange({ ...exclusions, roleIds: [...next] })}
          emptyLabel="Aucun rôle exclu"
        />
        <p className="text-xs text-muted-foreground">
          Les events liés à un membre portant un de ces rôles sont ignorés.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Salons exclus</Label>
        <EntityMultiPicker
          entityKind="channel"
          entities={channels}
          selectedIds={exclusions.channelIds}
          pending={pending}
          onChange={(next) => onChange({ ...exclusions, channelIds: [...next] })}
          emptyLabel="Aucun salon exclu"
        />
        <p className="text-xs text-muted-foreground">
          Les events qui se produisent dans un de ces salons sont ignorés.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={exclusions.excludeBots}
          onChange={(e) => onChange({ ...exclusions, excludeBots: e.target.checked })}
          className="h-4 w-4 rounded text-primary"
          aria-label="Exclure les bots des logs"
          disabled={pending}
        />
        Exclure les bots des logs
      </label>
    </div>
  );
}

/** Compteur de filtres actifs pour le récap. */
export function activeFilterCount(ex: LogsExclusionsClient): number {
  let n = 0;
  if (ex.userIds.length > 0) n += 1;
  if (ex.roleIds.length > 0) n += 1;
  if (ex.channelIds.length > 0) n += 1;
  if (ex.excludeBots) n += 1;
  return n;
}
