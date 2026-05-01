import { Card, CardContent } from '@varde/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../../lib/api-client';
import { moduleIcon } from '../shell/module-icons';

/**
 * Section « Démarrage rapide » de la vue d'ensemble (jalon 7 PR
 * 7.4.6). Visible uniquement si le serveur a moins de 2 modules
 * actifs — l'idée : un admin qui débarque a souvent installé le bot
 * sans avoir activé quoi que ce soit, on lui présente les modules
 * essentiels pour commencer.
 *
 * Cards horizontales avec icône + nom + short description + CTA
 * « Configurer ». Pas de toggle inline ici — on envoie l'admin sur
 * la page de config, qui assume de l'éduquer.
 *
 * Sélection des modules essentiels : les 4 modules officiels V1
 * (moderation, welcome, logs, reaction-roles) si présents sur
 * l'instance. Filtrés à ceux qui ne sont pas déjà actifs (la liste
 * affichée doit suggérer une action utile).
 */

const ESSENTIAL_MODULES = ['moderation', 'welcome', 'logs', 'reaction-roles'] as const;

export interface QuickStartSectionProps {
  readonly guildId: string;
  /** Tous les modules visibles par le user sur la guild. */
  readonly modules: readonly ModuleListItemDto[];
}

export function QuickStartSection({
  guildId,
  modules,
}: QuickStartSectionProps): ReactElement | null {
  const t = useTranslations('overview.quickStart');

  // Suggérés = modules essentiels présents sur l'instance, non encore
  // activés. Conserve l'ordre des `ESSENTIAL_MODULES` (priorité
  // produit), pas l'ordre d'apparition dans la liste API.
  const suggestions = ESSENTIAL_MODULES.map((id) => modules.find((m) => m.id === id)).filter(
    (m): m is ModuleListItemDto => m !== undefined && !m.enabled,
  );

  if (suggestions.length === 0) return null;

  return (
    <section aria-labelledby="quick-start-title" className="mt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="quick-start-title" className="text-lg font-semibold leading-tight text-foreground">
          {t('title')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestions.map((m) => (
          <Card key={m.id} className="interactive-lift">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-bg-surface-3 text-fg-secondary">
                {moduleIcon(m.id, 16)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                {m.shortDescription ? (
                  <p className="truncate text-xs text-muted-foreground">{m.shortDescription}</p>
                ) : null}
              </div>
              <Link
                href={`/guilds/${guildId}/modules/${m.id}`}
                className="rounded-md border border-border bg-bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                {t('configure')}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
