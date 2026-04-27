'use client';

import { CollapsibleSection } from '@varde/ui';
import type { ReactElement } from 'react';

import { FiltersSubsection } from './FiltersSubsection';
import type {
  ChannelOption,
  LogsExclusionsClient,
  LogsRouteClient,
  RoleOption,
} from './LogsConfigEditor';
import { RoutesSubsection } from './RoutesSubsection';
import { TechnicalLimitsSubsection } from './TechnicalLimitsSubsection';

export interface AdvancedConfigSectionProps {
  readonly guildId: string;
  readonly routes: readonly LogsRouteClient[];
  readonly onRoutesChange: (next: readonly LogsRouteClient[]) => void;
  readonly exclusions: LogsExclusionsClient;
  readonly onExclusionsChange: (next: LogsExclusionsClient) => void;
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
  readonly storageKey: string;
  /**
   * Auto-ouvre la section au mount si `true`. Le shell calcule cette
   * valeur via `isAdvancedConfig(initialConfig)` — un admin qui a
   * déjà des routes ou des filtres voit la section dépliée d'office,
   * sinon elle reste fermée par défaut.
   */
  readonly autoOpen: boolean;
  readonly pending?: boolean;
  readonly onFeedback?: (feedback: { kind: 'success' | 'error'; message: string }) => void;
}

/**
 * Section « Configuration avancée » repliable. Encapsule les 3 sous-
 * sections : Routes additionnelles, Filtres globaux, Limites
 * techniques. État ouvert/fermé persisté en localStorage via la prop
 * `storageKey` (cf. `CollapsibleSection`).
 *
 * La sous-section Routes ne reçoit que les routes additionnelles
 * (la simple-route est filtrée en amont par le shell) — l'admin
 * configure ici uniquement les routes qui détournent des events
 * loin du salon de destination principal.
 */
export function AdvancedConfigSection({
  guildId,
  routes,
  onRoutesChange,
  exclusions,
  onExclusionsChange,
  channels,
  roles,
  storageKey,
  autoOpen,
  pending = false,
  onFeedback,
}: AdvancedConfigSectionProps): ReactElement {
  return (
    <CollapsibleSection
      title="Configuration avancée"
      subtitle="Routes multi-salons, filtres globaux, limites techniques."
      defaultOpen={autoOpen}
      storageKey={storageKey}
    >
      <div className="space-y-6">
        <p className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-muted-foreground">
          Pour la majorité des serveurs, la configuration ci-dessus suffit. N'active ceci que si tu
          as besoin de séparer les types d'events dans plusieurs salons ou d'exclure des
          utilisateurs / rôles spécifiques.
        </p>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Routes de destination
          </h3>
          <RoutesSubsection
            guildId={guildId}
            routes={routes}
            onRoutesChange={onRoutesChange}
            channels={channels}
            {...(onFeedback ? { onFeedback } : {})}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filtres globaux
          </h3>
          <p className="text-xs text-muted-foreground">
            S'appliquent à toutes les routes. Un event lié à un utilisateur, rôle ou salon filtré
            sera ignoré.
          </p>
          <FiltersSubsection
            exclusions={exclusions}
            roles={roles}
            channels={channels}
            onChange={onExclusionsChange}
            pending={pending}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Limites techniques
          </h3>
          <TechnicalLimitsSubsection />
        </div>
      </div>
    </CollapsibleSection>
  );
}
