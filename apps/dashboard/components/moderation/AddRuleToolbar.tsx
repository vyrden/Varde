'use client';

import { Button } from '@varde/ui';
import type { ReactElement } from 'react';

import {
  blankBlacklist,
  blankCaps,
  blankEmojis,
  blankInvites,
  blankKeywordList,
  blankLinks,
  blankMentions,
  blankRateLimit,
  blankRegex,
  blankSpoilers,
  blankZalgo,
} from './rule-blanks';
import { KIND_TOOLTIP } from './rule-meta';
import type { AutomodRuleClient } from './types';

interface ToolbarEntry {
  readonly label: string;
  readonly factory: () => AutomodRuleClient;
  readonly kind: AutomodRuleClient['kind'];
}

interface ToolbarGroup {
  readonly title: string;
  readonly entries: ReadonlyArray<ToolbarEntry>;
}

/**
 * Liste des kinds manuels regroupés par famille pour la section
 * « Règles manuelles (avancé) » de l'AutomodTab. La famille IA est
 * volontairement absente — elle est mise en avant à part dans la
 * section « Modération par IA (recommandé) ». Les libellés et
 * tooltips viennent de `rule-meta.ts` pour rester centralisés.
 */
export const MANUAL_RULE_GROUPS: ReadonlyArray<ToolbarGroup> = [
  {
    title: 'Filtres de texte',
    entries: [
      { label: 'Blacklist', factory: blankBlacklist, kind: 'blacklist' },
      { label: 'Wordlist FR/EN', factory: blankKeywordList, kind: 'keyword-list' },
      { label: 'Regex', factory: blankRegex, kind: 'regex' },
    ],
  },
  {
    title: 'Liens & invites',
    entries: [
      { label: 'Invitations Discord', factory: blankInvites, kind: 'invites' },
      { label: 'Liens externes', factory: blankLinks, kind: 'links' },
    ],
  },
  {
    title: 'Anti-spam',
    entries: [
      { label: 'Rate-limit', factory: blankRateLimit, kind: 'rate-limit' },
      { label: 'Majuscules', factory: blankCaps, kind: 'caps' },
      { label: 'Emojis', factory: blankEmojis, kind: 'emojis' },
      { label: 'Spoilers', factory: blankSpoilers, kind: 'spoilers' },
      { label: 'Mentions de masse', factory: blankMentions, kind: 'mentions' },
      { label: 'Zalgo', factory: blankZalgo, kind: 'zalgo' },
    ],
  },
];

export interface AddRuleToolbarProps {
  readonly pending: boolean;
  readonly onAdd: (factory: () => AutomodRuleClient) => void;
  /**
   * Groupes de boutons à afficher. Défaut : `MANUAL_RULE_GROUPS`
   * (tous les kinds non-IA). L'appelant peut passer un sous-ensemble
   * pour proposer une toolbar restreinte si besoin.
   */
  readonly groups?: ReadonlyArray<ToolbarGroup>;
}

/**
 * Barre d'ajout de règles regroupée en familles avec tooltip natif
 * pédagogique sur chaque bouton. Le tooltip explique en 1 phrase ce
 * que fait le kind — l'admin n'a pas besoin de connaître les termes
 * techniques (regex, sliding window, etc.) pour choisir.
 */
export function AddRuleToolbar({
  pending,
  onAdd,
  groups = MANUAL_RULE_GROUPS,
}: AddRuleToolbarProps): ReactElement {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Ajouter une règle
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-wrap items-start gap-1.5">
            <span className="w-44 shrink-0 pt-1.5 text-[11px] text-muted-foreground">
              {group.title}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.entries.map((entry) => (
                <Button
                  key={entry.kind}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAdd(entry.factory)}
                  disabled={pending}
                  title={KIND_TOOLTIP[entry.kind]}
                >
                  + {entry.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
