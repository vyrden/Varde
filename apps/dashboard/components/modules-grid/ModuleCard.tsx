'use client';

import { Badge, Card, CardContent } from '@varde/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import type { ModuleListItemDto } from '../../lib/api-client';
import { ModuleEnabledToggle } from '../ModuleEnabledToggle';
import { moduleIcon } from '../shell/module-icons';
import { PinButton } from './PinButton';

/**
 * Carte de module dans la grille (jalon 7 PR 7.4.7).
 *
 * Pattern « stretched-link » : un `<Link>` absolute zéro inset sous
 * le contenu visuel sert de cible de clic pour toute la card. Les
 * éléments interactifs (toggle, pin) sont en `relative z-10` pour
 * capturer leurs propres clics et appellent `stopPropagation()`
 * dans leurs handlers — la navigation se déclenche uniquement
 * quand on clique en dehors d'eux.
 *
 * Détermine le statut « configuré » via `lastConfiguredAt` : non-null
 * = au moins un `core.config.updated` enregistré pour ce module sur
 * cette guild → considéré configuré.
 *
 * shortDescription fallback : si le manifeste ne fournit pas
 * `shortDescription`, on coupe `description` au premier `.` ou
 * `\n` pour produire une phrase courte. Dégrade proprement quand
 * description ne contient ni l'un ni l'autre (rendu intégral).
 */

export interface ModuleCardProps {
  readonly guildId: string;
  readonly module: ModuleListItemDto;
  /**
   * Notification d'erreur remontée par le PinButton (max 8 épingles
   * dépassé, etc.). Le caller affiche un toast.
   */
  readonly onPinError?: (code: string, message: string) => void;
}

const truncateDescription = (full: string, short: string | null): string => {
  if (short && short.length > 0) return short;
  if (full.length === 0) return '';
  // Coupe au premier point ou retour ligne. Garde le point final.
  const idx = full.search(/[.\n]/);
  if (idx === -1) return full;
  return full.slice(0, idx + 1).trim();
};

export function ModuleCard({ guildId, module, onPinError }: ModuleCardProps): ReactElement {
  const t = useTranslations('modulesGrid.card');
  const desc = truncateDescription(module.description, module.shortDescription);
  const isConfigured = module.lastConfiguredAt !== null;
  const href = `/guilds/${guildId}/modules/${module.id}`;

  return (
    <Card className="group relative interactive-lift hover:border-border-strong/60">
      <Link
        href={href}
        aria-label={t('cardLabel', { name: module.name })}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">{module.name}</span>
      </Link>
      <CardContent className="relative z-10 flex flex-col gap-3 p-4">
        <div className="pointer-events-none flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-bg-surface-3 text-fg-secondary">
            {moduleIcon(module.id, 18)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground" title={module.name}>
                {module.name}
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={module.enabled ? 'active' : 'inactive'}
                className="text-[10px] uppercase tracking-wider"
              >
                {module.enabled ? t('badgeActive') : t('badgeInactive')}
              </Badge>
              <Badge
                variant={isConfigured ? 'default' : 'outline'}
                className="text-[10px] uppercase tracking-wider"
              >
                {isConfigured ? t('badgeConfigured') : t('badgeUnconfigured')}
              </Badge>
            </div>
          </div>
        </div>
        {desc.length > 0 ? (
          <p className="pointer-events-none line-clamp-2 text-xs text-muted-foreground">{desc}</p>
        ) : null}
        <div
          className="mt-1 flex items-center justify-between border-t border-border pt-3"
          // Cette zone contient les éléments interactifs ; on désactive
          // explicitement la navigation pour qu'un clic dans la zone
          // (mais hors des contrôles eux-mêmes) ne navigue pas non
          // plus. Les contrôles ont `stopPropagation` côté handler.
          onClickCapture={(event) => {
            event.stopPropagation();
          }}
        >
          <PinButton
            guildId={guildId}
            moduleId={module.id}
            moduleName={module.name}
            initialPinned={module.isPinned}
            {...(onPinError ? { onError: onPinError } : {})}
          />
          <ModuleEnabledToggle
            guildId={guildId}
            moduleId={module.id}
            moduleName={module.name}
            initialEnabled={module.enabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
