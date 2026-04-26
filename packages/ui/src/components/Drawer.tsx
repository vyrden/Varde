'use client';

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';

import { cn } from '../lib/cn.js';

export interface DrawerProps {
  /** Contrôlé : `true` pour afficher, `false` pour masquer. */
  readonly open: boolean;
  /** Appelé quand l'utilisateur ferme (overlay click, Esc, bouton ✕). */
  readonly onClose: () => void;
  /** Titre lu par les SR via `aria-labelledby`. Affiché en header. */
  readonly title: string;
  /** Sous-titre optionnel sous le titre, pour contextualiser. */
  readonly subtitle?: string;
  /** Contenu principal scrollable. */
  readonly children: ReactNode;
  /** Pied facultatif (CTAs, etc.) — sticky en bas, hors zone scrollable. */
  readonly footer?: ReactNode;
  /**
   * Largeur max du panneau. Défaut `lg` ≈ 32rem. Utiliser `xl` pour
   * un détail riche (audit entry, preset preview).
   */
  readonly size?: 'md' | 'lg' | 'xl';
  /** Côté d'apparition. Défaut « right ». */
  readonly side?: 'right' | 'left';
}

const SIZE_CLASS: Record<NonNullable<DrawerProps['size']>, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
};

/**
 * Panneau coulissant ancré sur un côté de l'écran. Implémentation
 * légère sans portal Radix : un overlay full-screen + un panneau
 * positionné absolument. Suffit pour les cas usage V1 (preview
 * preset, détail audit). Pas de focus trap formel — on rappelle le
 * focus au panneau à l'ouverture et `Esc` referme. WCAG : `role="dialog"`,
 * `aria-modal`, `aria-labelledby` pointant vers le titre.
 *
 * Le scroll de fond est gelé tant que le drawer est ouvert pour que
 * la molette ne fasse pas défiler la page sous l'overlay (pattern
 * standard des modaux).
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'lg',
  side = 'right',
}: DrawerProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useRef(`drawer-title-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  const onOverlayClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  const sideClass = side === 'right' ? 'right-0' : 'left-0';

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop d'un modal — la sémantique d'interaction est portée par le `role="dialog"` enfant ; le wrapper sert uniquement à intercepter clic-extérieur et Esc.
    <div
      className="fixed inset-0 z-50 flex"
      onClick={onOverlayClick}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        tabIndex={-1}
        className={cn(
          'relative flex h-full w-full flex-col bg-surface shadow-2xl outline-none',
          'sm:absolute sm:top-0 sm:bottom-0',
          sideClass,
          SIZE_CLASS[size],
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId.current} className="truncate text-base font-semibold text-foreground">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-active hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="border-t border-border bg-sidebar px-5 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}
