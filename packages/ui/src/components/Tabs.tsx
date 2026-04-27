'use client';

import {
  createContext,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
} from 'react';

import { cn } from '../lib/cn.js';

/**
 * Composant Tabs générique en pattern context — `Tabs` racine porte
 * la valeur courante, `TabsList` regroupe les déclencheurs
 * (`TabsTrigger`), `TabsContent` rend un panneau pour une valeur
 * donnée. ARIA `tablist` / `tab` / `tabpanel` complets, navigation
 * clavier flèches gauche/droite + Home/End avec focus management
 * type Radix.
 *
 * Variant unique : underline discret (cohérent avec le design system
 * Discord-like). Mobile : la `TabsList` autorise un overflow-x natif.
 *
 * Usage typique :
 *
 * ```tsx
 * const [tab, setTab] = useState('general');
 * <Tabs value={tab} onValueChange={setTab}>
 *   <TabsList ariaLabel="Sections">
 *     <TabsTrigger value="general">Général</TabsTrigger>
 *     <TabsTrigger value="advanced">Avancé</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="general">…</TabsContent>
 *   <TabsContent value="advanced">…</TabsContent>
 * </Tabs>
 * ```
 *
 * Le state vit chez l'appelant — pas de mode uncontrolled — pour
 * permettre la persistance via URL (`?tab=…`) ou store partagé.
 */

interface TabsContextValue {
  readonly value: string;
  readonly onValueChange: (next: string) => void;
  readonly registerTrigger: (value: string, node: HTMLButtonElement | null) => void;
  readonly focusByOffset: (current: string, offset: 1 | -1) => void;
  readonly focusFirst: () => void;
  readonly focusLast: () => void;
  readonly idPrefix: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabsContext = (component: string): TabsContextValue => {
  const ctx = useContext(TabsContext);
  if (ctx === null) {
    throw new Error(`<${component}> doit être utilisé dans un <Tabs>`);
  }
  return ctx;
};

export interface TabsProps {
  readonly value: string;
  readonly onValueChange: (next: string) => void;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps): ReactElement {
  const idPrefix = useId();
  const triggers = useRef<Map<string, HTMLButtonElement>>(new Map());

  const registerTrigger = useCallback((key: string, node: HTMLButtonElement | null): void => {
    if (node === null) {
      triggers.current.delete(key);
      return;
    }
    triggers.current.set(key, node);
  }, []);

  const focusByOffset = useCallback(
    (current: string, offset: 1 | -1): void => {
      const keys = Array.from(triggers.current.keys());
      if (keys.length === 0) return;
      const idx = keys.indexOf(current);
      if (idx === -1) return;
      const nextIdx = (idx + offset + keys.length) % keys.length;
      const nextKey = keys[nextIdx];
      if (nextKey === undefined) return;
      const node = triggers.current.get(nextKey);
      node?.focus();
      onValueChange(nextKey);
    },
    [onValueChange],
  );

  const focusFirst = useCallback((): void => {
    const first = triggers.current.keys().next().value;
    if (first === undefined) return;
    triggers.current.get(first)?.focus();
    onValueChange(first);
  }, [onValueChange]);

  const focusLast = useCallback((): void => {
    const keys = Array.from(triggers.current.keys());
    const last = keys[keys.length - 1];
    if (last === undefined) return;
    triggers.current.get(last)?.focus();
    onValueChange(last);
  }, [onValueChange]);

  const ctx = useMemo<TabsContextValue>(
    () => ({
      value,
      onValueChange,
      registerTrigger,
      focusByOffset,
      focusFirst,
      focusLast,
      idPrefix,
    }),
    [value, onValueChange, registerTrigger, focusByOffset, focusFirst, focusLast, idPrefix],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Conteneur des onglets. `flex-wrap` plutôt que `overflow-x-auto` :
 * si la largeur disponible ne suffit pas (peu de tabs avec libellés
 * longs sur écran très étroit), les déclencheurs passent à la ligne
 * suivante au lieu de proposer un scroll horizontal — pas de chrome
 * de scrollbar à masquer, pas de scroll involontaire au trackpad
 * quand la barre rentre déjà. Le `border-b` du conteneur sert
 * d'ancrage visuel pour l'underline des déclencheurs actifs
 * (`-mb-[2px]` côté trigger).
 */
export function TabsList({ ariaLabel, children, className }: TabsListProps): ReactElement {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex flex-wrap gap-1 border-b-2 border-border', className)}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps {
  readonly value: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
}

export function TabsTrigger({
  value,
  children,
  className,
  disabled,
}: TabsTriggerProps): ReactElement {
  const ctx = useTabsContext('TabsTrigger');
  const active = ctx.value === value;
  const triggerId = `${ctx.idPrefix}-trigger-${value}`;
  const panelId = `${ctx.idPrefix}-panel-${value}`;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      ctx.focusByOffset(value, 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      ctx.focusByOffset(value, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      ctx.focusFirst();
    } else if (event.key === 'End') {
      event.preventDefault();
      ctx.focusLast();
    }
  };

  return (
    <button
      ref={(node) => ctx.registerTrigger(value, node)}
      id={triggerId}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      onClick={() => ctx.onValueChange(value)}
      onKeyDown={onKeyDown}
      className={cn(
        '-mb-[2px] flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium',
        'border-b-2 transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps {
  readonly value: string;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Si `true`, le panneau reste monté quand inactif (utile pour
   * préserver l'état de formulaires lourds entre changements de
   * tabs). Sinon le panneau est déchargé. Défaut : `true` —
   * le cas commun pour ce design system est de préserver l'état.
   */
  readonly forceMount?: boolean;
}

export function TabsContent({
  value,
  children,
  className,
  forceMount = true,
}: TabsContentProps): ReactElement | null {
  const ctx = useTabsContext('TabsContent');
  const active = ctx.value === value;
  const triggerId = `${ctx.idPrefix}-trigger-${value}`;
  const panelId = `${ctx.idPrefix}-panel-${value}`;
  if (!active && !forceMount) return null;
  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={triggerId}
      hidden={!active}
      className={cn(active ? '' : 'hidden', className)}
    >
      {children}
    </div>
  );
}
