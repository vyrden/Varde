'use client';

import { type ReactElement, type ReactNode, useEffect, useId, useState } from 'react';

import { cn } from '../lib/cn.js';

/**
 * Section repliable générique — pattern « progressive disclosure ».
 * Pas de toggle d'activation (contrairement à `ExpandablePanel`),
 * juste un header cliquable + body monté/démonté. Utilisé pour cacher
 * la configuration avancée derrière un disclosure clair.
 *
 * État ouvert/fermé contrôlé ou non :
 * - Si `open` + `onOpenChange` fournis → controlled.
 * - Sinon, état interne avec `defaultOpen` initial.
 *
 * Persistance optionnelle via `storageKey` : l'état est sérialisé en
 * `localStorage` au format `'1' | '0'`. Permet à un admin qui a déplié
 * la section de la retrouver dépliée au prochain chargement, sans
 * couplage URL. Fournir une clé scopée par-guild (ex.
 * `varde:logs:advanced:<guildId>`) pour éviter le partage entre
 * serveurs.
 *
 * Le body est toujours monté quand `forceMount=true` (défaut), ce qui
 * préserve l'état des formulaires lourds. `hidden` ARIA est posé sur
 * le panneau quand fermé, comme pour les Tabs.
 */
export interface CollapsibleSectionProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly badge?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (next: boolean) => void;
  readonly storageKey?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly headerClassName?: string;
  readonly bodyClassName?: string;
  readonly forceMount?: boolean;
}

const readPersisted = (key: string | undefined): boolean | null => {
  if (key === undefined) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* localStorage indisponible (private mode, quota) — ignore */
  }
  return null;
};

const writePersisted = (key: string | undefined, value: boolean): void => {
  if (key === undefined) return;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
};

export function CollapsibleSection({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  storageKey,
  children,
  className,
  headerClassName,
  bodyClassName,
  forceMount = true,
}: CollapsibleSectionProps): ReactElement {
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(() => {
    const persisted = readPersisted(storageKey);
    if (persisted !== null) return persisted;
    return defaultOpen;
  });
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const bodyId = useId();

  // Synchronise le storage à chaque changement d'état (qu'il soit
  // contrôlé ou non) — la persistance est indépendante du mode.
  useEffect(() => {
    writePersisted(storageKey, isOpen);
  }, [storageKey, isOpen]);

  const setOpen = (next: boolean): void => {
    if (onOpenChange) onOpenChange(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };

  return (
    <section className={cn('rounded-lg border border-border bg-card shadow-sm', className)}>
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className={cn(
          'flex w-full items-start justify-between gap-3 px-6 py-4 text-left transition-colors',
          'hover:bg-surface-active/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          headerClassName,
        )}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">{title}</span>
            {badge}
          </div>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <span
          aria-hidden="true"
          className={cn(
            'mt-1 shrink-0 text-muted-foreground transition-transform duration-150',
            isOpen ? 'rotate-180' : '',
          )}
        >
          ▾
        </span>
      </button>
      {forceMount || isOpen ? (
        <div
          id={bodyId}
          hidden={!isOpen}
          className={cn('border-t border-border px-6 py-5', isOpen ? '' : 'hidden', bodyClassName)}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
