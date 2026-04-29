import type { ReactElement } from 'react';

import type { PrivilegedIntentName } from '../../lib/setup-client';

/**
 * Liste les 3 intents privilégiés Discord (Presence, Server Members,
 * Message Content) avec un statut activé/manquant déduit de la
 * réponse de `POST /setup/bot-token`. Affichée à l'étape « Token bot
 * et intents » du wizard (jalon 7 PR 7.1).
 *
 * Les intents activés portent une pastille verte ; les manquants
 * une pastille rouge plus un lien vers le portail Developer pour
 * que l'admin coche la case puis revienne valider.
 */

export interface IntentsCheckListProps {
  /**
   * Intents marqués comme manquants par l'API. La liste vide signifie
   * que les trois sont activés correctement.
   */
  readonly missing: readonly PrivilegedIntentName[];
  /** Libellé traduit de chaque intent. */
  readonly labels: Readonly<Record<PrivilegedIntentName, string>>;
  /** Libellé du lien vers le portail Discord (« Activer »). */
  readonly enableLabel: string;
  /** URL du portail Discord — `https://discord.com/developers/applications`. */
  readonly portalHref: string;
}

const INTENT_ORDER = [
  'PRESENCE',
  'GUILD_MEMBERS',
  'MESSAGE_CONTENT',
] as const satisfies readonly PrivilegedIntentName[];

export function IntentsCheckList({
  missing,
  labels,
  enableLabel,
  portalHref,
}: IntentsCheckListProps): ReactElement {
  const missingSet = new Set<PrivilegedIntentName>(missing);
  return (
    <ul
      className="divide-y divide-border-muted overflow-hidden rounded-md border border-border-muted bg-sidebar"
      data-testid="intents-check-list"
    >
      {INTENT_ORDER.map((intent) => {
        const isMissing = missingSet.has(intent);
        return (
          <li
            key={intent}
            className="flex items-center gap-3 px-4 py-3"
            data-testid={`intent-${intent}`}
          >
            <span
              aria-label={isMissing ? 'KO' : 'OK'}
              role="img"
              className={`inline-block h-2.5 w-2.5 flex-none rounded-full ${
                isMissing ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
            />
            <span className="flex-1 text-sm font-medium text-foreground">{labels[intent]}</span>
            {isMissing ? (
              <a
                href={portalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                {enableLabel}
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
