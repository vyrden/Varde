'use client';

import { type ReactNode, useId, useState } from 'react';

import { cn } from '../lib/cn.js';
import { Toggle } from './Toggle.js';

export interface ExpandablePanelProps {
  readonly title: string;
  /** Sous-titre décoratif sous le titre (description courte). */
  readonly description?: string;
  /** Contrôle l'état d'activation visuel (toggle dans le header). */
  readonly enabled: boolean;
  readonly onEnabledChange: (next: boolean) => void;
  /**
   * Contrôle l'état replié/déplié indépendamment de l'activation —
   * utile pour permettre à l'admin de plier le bloc même quand il
   * est activé. Si non fourni, le panneau s'ouvre/ferme suivant
   * l'état d'activation.
   */
  readonly expanded?: boolean;
  readonly onExpandedChange?: (next: boolean) => void;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Section repliable façon Discord avec toggle d'activation dans son
 * header. Quand `enabled` est false, le body reste pliable mais
 * indique visuellement qu'il est inactif. Convention DA :
 *
 * - Header : titre + description + toggle activation à droite
 * - Body : visible uniquement quand `expanded` est true
 * - État replié = config masquée, **pas détruite** (state préservé
 *   côté parent)
 */
export function ExpandablePanel({
  title,
  description,
  enabled,
  onEnabledChange,
  expanded: controlledExpanded,
  onExpandedChange,
  children,
  className,
}: ExpandablePanelProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(enabled);
  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const setExpanded = (next: boolean) => {
    if (onExpandedChange) onExpandedChange(next);
    else setUncontrolledExpanded(next);
  };

  const bodyId = useId();
  const headerId = useId();

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card transition-colors',
        enabled ? '' : 'opacity-80',
        className,
      )}
    >
      <header id={headerId} className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className={cn(
              'shrink-0 text-muted-foreground transition-transform duration-150',
              expanded ? 'rotate-90' : '',
            )}
          >
            <path
              d="M4 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </button>
        <Toggle checked={enabled} onCheckedChange={onEnabledChange} label={`Activer ${title}`} />
      </header>
      {expanded ? (
        <section
          id={bodyId}
          aria-labelledby={headerId}
          className="border-t border-border px-4 py-4"
        >
          {children}
        </section>
      ) : null}
    </section>
  );
}
