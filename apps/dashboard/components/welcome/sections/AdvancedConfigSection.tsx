'use client';

import { Card, CardContent, CardHeader, CardTitle, CollapsibleSection, Toggle } from '@varde/ui';
import type { ReactElement } from 'react';

import { AccountAgeFilterSection } from '../AccountAgeFilterSection';
import { AutoroleSection } from '../AutoroleSection';
import type { RoleOption, WelcomeConfigClient } from '../types';

export interface AdvancedConfigSectionProps {
  readonly autorole: WelcomeConfigClient['autorole'];
  readonly onAutoroleChange: (next: WelcomeConfigClient['autorole']) => void;
  readonly accountAgeFilter: WelcomeConfigClient['accountAgeFilter'];
  readonly onAccountAgeFilterChange: (next: WelcomeConfigClient['accountAgeFilter']) => void;
  readonly roles: readonly RoleOption[];
  /** Persistance localStorage de l'état ouvert/fermé. */
  readonly storageKey: string;
  /**
   * Auto-ouvre la section au mount si `true`. Le shell calcule cette
   * valeur via `isAdvancedConfig(initialConfig)` — un admin qui a déjà
   * un auto-rôle ou un filtre actif voit la section dépliée d'office.
   */
  readonly autoOpen: boolean;
  readonly pending?: boolean;
}

/**
 * Section « Configuration avancée » repliable, pendant des modules
 * Logs et Moderation. Encapsule les deux sous-sections optionnelles
 * du module welcome :
 *
 * - Auto-rôle : attribution de rôles à l'arrivée.
 * - Filtre comptes neufs : kick / quarantaine selon l'âge du compte.
 *
 * Chaque sous-section est une Card autonome avec son propre Toggle
 * dans le header — uniformité avec les sections principales (Welcome
 * Message, Goodbye Message). État ouvert/fermé persisté en
 * localStorage via `storageKey`.
 */
export function AdvancedConfigSection({
  autorole,
  onAutoroleChange,
  accountAgeFilter,
  onAccountAgeFilterChange,
  roles,
  storageKey,
  autoOpen,
  pending = false,
}: AdvancedConfigSectionProps): ReactElement {
  return (
    <CollapsibleSection
      title="Configuration avancée"
      subtitle="Auto-rôle à l'arrivée, filtre anti-comptes neufs."
      defaultOpen={autoOpen}
      storageKey={storageKey}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-muted-foreground">
          Pour la majorité des serveurs, l'accueil et le départ ci-dessus suffisent. Active ces
          options uniquement si tu en as besoin.
        </p>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  Auto-rôle{' '}
                  <span aria-hidden="true" className="text-base">
                    🎭
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Attribue automatiquement un ou plusieurs rôles aux nouveaux membres.
                </p>
              </div>
              <Toggle
                checked={autorole.enabled}
                onCheckedChange={(enabled) => onAutoroleChange({ ...autorole, enabled })}
                disabled={pending}
                label={autorole.enabled ? "Désactiver l'auto-rôle" : "Activer l'auto-rôle"}
              />
            </div>
          </CardHeader>
          {autorole.enabled ? (
            <CardContent>
              <AutoroleSection
                value={autorole}
                onChange={onAutoroleChange}
                roles={roles}
                pending={pending}
              />
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  Filtre comptes neufs{' '}
                  <span aria-hidden="true" className="text-base">
                    🛡️
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Anti-raid basique : kick ou quarantaine pour les comptes Discord trop récents.
                </p>
              </div>
              <Toggle
                checked={accountAgeFilter.enabled}
                onCheckedChange={(enabled) =>
                  onAccountAgeFilterChange({ ...accountAgeFilter, enabled })
                }
                disabled={pending}
                label={accountAgeFilter.enabled ? 'Désactiver le filtre' : 'Activer le filtre'}
              />
            </div>
          </CardHeader>
          {accountAgeFilter.enabled ? (
            <CardContent>
              <AccountAgeFilterSection
                value={accountAgeFilter}
                onChange={onAccountAgeFilterChange}
                roles={roles}
              />
            </CardContent>
          ) : null}
        </Card>
      </div>
    </CollapsibleSection>
  );
}
