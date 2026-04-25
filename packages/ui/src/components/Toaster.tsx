'use client';

import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '../lib/cn.js';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  readonly title: string;
  readonly description?: string;
  readonly kind?: ToastKind;
  /** Durée d'affichage en ms (défaut 4000). */
  readonly durationMs?: number;
}

interface InternalToast extends ToastInput {
  readonly id: string;
}

interface ToastContextValue {
  readonly toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook pour pousser un toast depuis n'importe quel composant client.
 * Lève si appelé hors d'un `<Toaster>` — c'est intentionnel : un
 * appel sans provider est un bug de structure.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast doit être appelé sous <Toaster />');
  }
  return ctx;
}

const KIND_STYLES: Readonly<Record<ToastKind, { container: string; icon: ReactElement }>> = {
  success: {
    container: 'border-success/50 bg-success/10 text-foreground',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3 8l3 3 7-7"
          stroke="var(--success)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  error: {
    container: 'border-destructive/50 bg-destructive/10 text-foreground',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="var(--destructive)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  warning: {
    container: 'border-warning/50 bg-warning/10 text-foreground',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 2l6 11H2L8 2zM8 7v3M8 12h.01"
          stroke="var(--warning)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  info: {
    container: 'border-info/50 bg-info/10 text-foreground',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="var(--info)" strokeWidth="1.6" />
        <path d="M8 7v4M8 5.5h.01" stroke="var(--info)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
};

/**
 * Provider + viewport des toasts. À placer une fois dans un layout
 * client (typiquement le shell guild). Les toasts s'empilent en bas
 * à droite, disparaissent après `durationMs` (défaut 4 s) ou au
 * clic sur la croix de fermeture.
 */
export function Toaster({ children }: { readonly children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<readonly InternalToast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    counterRef.current += 1;
    const id = `t-${counterRef.current}`;
    setToasts((prev) => [...prev, { ...input, id }]);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  readonly toast: InternalToast;
  readonly onDismiss: () => void;
}): ReactElement {
  useEffect(() => {
    const handle = setTimeout(onDismiss, toast.durationMs ?? 4000);
    return () => clearTimeout(handle);
  }, [onDismiss, toast.durationMs]);

  const kind = toast.kind ?? 'info';
  const style = KIND_STYLES[kind];

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex gap-3 rounded-md border p-3 shadow-lg backdrop-blur-sm',
        style.container,
      )}
    >
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer la notification"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
