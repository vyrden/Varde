'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Drawer,
  Input,
  Select,
} from '@varde/ui';
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AuditActorType,
  AuditFilters,
  AuditLogItemDto,
  AuditSeverity,
} from '../../lib/api-client';
import { loadAuditPage } from '../../lib/audit-actions';
import { formatRelativeDate } from '../../lib/format-relative-date';

export interface AuditViewProps {
  readonly guildId: string;
  readonly initialItems: readonly AuditLogItemDto[];
  readonly initialNextCursor: string | undefined;
  readonly initialFilters: AuditFilters;
  readonly knownActions: readonly string[];
  /**
   * Filtres "verrouillés" toujours appliqués, non éditables côté UI.
   * Utilisé par les pages contextuelles (ex. modération filtre par
   * `moduleId='moderation'`) pour scoper la vue. Mergés au niveau API
   * à chaque fetch — même au reset de la barre de filtres.
   */
  readonly lockedFilters?: AuditFilters;
}

interface FiltersState {
  readonly action: string;
  readonly actorType: '' | AuditActorType;
  readonly severity: '' | AuditSeverity;
  readonly since: string;
  readonly until: string;
}

const filtersFromInitial = (initial: AuditFilters): FiltersState => ({
  action: initial.action ?? '',
  actorType: initial.actorType ?? '',
  severity: initial.severity ?? '',
  since: initial.since ?? '',
  until: initial.until ?? '',
});

const toApiFilters = (state: FiltersState, cursor?: string): AuditFilters => {
  const out: {
    action?: string;
    actorType?: AuditActorType;
    severity?: AuditSeverity;
    since?: string;
    until?: string;
    cursor?: string;
  } = {};
  if (state.action.trim().length > 0) out.action = state.action.trim();
  if (state.actorType !== '') out.actorType = state.actorType;
  if (state.severity !== '') out.severity = state.severity;
  if (state.since.length > 0) out.since = state.since;
  if (state.until.length > 0) out.until = state.until;
  if (cursor !== undefined && cursor.length > 0) out.cursor = cursor;
  return out;
};

const activeFilterCount = (s: FiltersState): number => {
  let n = 0;
  if (s.action.trim().length > 0) n += 1;
  if (s.actorType !== '') n += 1;
  if (s.severity !== '') n += 1;
  if (s.since.length > 0) n += 1;
  if (s.until.length > 0) n += 1;
  return n;
};

// --- Action / actor / severity helpers ---

function splitAction(action: string): { namespace: string; suffix: string } {
  const idx = action.indexOf('.');
  if (idx === -1) return { namespace: '', suffix: action };
  return { namespace: action.slice(0, idx), suffix: action.slice(idx) };
}

const SEVERITY_BADGE: Record<
  AuditSeverity,
  { variant: 'default' | 'warning' | 'danger'; symbol: string }
> = {
  info: { variant: 'default', symbol: 'ℹ' },
  warn: { variant: 'warning', symbol: '⚠' },
  error: { variant: 'danger', symbol: '✕' },
};

const ACTOR_BADGE: Record<
  AuditActorType,
  {
    variant: 'default' | 'inactive' | 'outline';
    icon: string;
    label: (id: string | null) => string;
  }
> = {
  user: {
    variant: 'default',
    icon: '👤',
    label: (id) => (id ? `Utilisateur ${id.slice(-4)}` : 'Utilisateur'),
  },
  system: { variant: 'inactive', icon: '⚙', label: () => 'Système' },
  module: { variant: 'outline', icon: '🧩', label: (id) => `module ${id ?? '?'}` },
};

function metadataPreview(metadata: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '—';
  const preview = entries
    .slice(0, 3)
    .map(([k, v]) => {
      const serialized = typeof v === 'string' ? v : JSON.stringify(v);
      const trimmed = serialized.length > 40 ? `${serialized.slice(0, 37)}…` : serialized;
      return `${k}: ${trimmed}`;
    })
    .join(', ');
  return entries.length > 3 ? `${preview}, …` : preview;
}

function metadataTooltip(metadata: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
}

// --- Subcomponents ---

interface FiltersBarProps {
  readonly state: FiltersState;
  readonly onChange: (next: FiltersState) => void;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
  readonly knownActions: readonly string[];
  readonly disabled: boolean;
}

function FiltersBar({
  state,
  onChange,
  onSubmit,
  onReset,
  knownActions,
  disabled,
}: FiltersBarProps): ReactElement {
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    onSubmit();
  };
  const active = activeFilterCount(state);

  return (
    <form
      onSubmit={submit}
      aria-label="Filtres audit"
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
    >
      <div className="min-w-[14rem] flex-1 space-y-1">
        <label
          htmlFor="filter-action"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Action
        </label>
        <Input
          id="filter-action"
          name="action"
          list="audit-action-suggestions"
          value={state.action}
          onChange={(e) => onChange({ ...state, action: e.target.value })}
          placeholder="ex. core.config.updated"
        />
        <datalist id="audit-action-suggestions">
          {knownActions.map((action) => (
            <option key={action} value={action} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="filter-actor"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Type d'acteur
        </label>
        <Select
          id="filter-actor"
          name="actorType"
          value={state.actorType}
          onChange={(e) =>
            onChange({ ...state, actorType: e.target.value as FiltersState['actorType'] })
          }
          wrapperClassName="w-44"
        >
          <option value="">Tous</option>
          <option value="user">👤 Utilisateur</option>
          <option value="system">⚙ Système</option>
          <option value="module">🧩 Module</option>
        </Select>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="filter-severity"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Sévérité
        </label>
        <Select
          id="filter-severity"
          name="severity"
          value={state.severity}
          onChange={(e) =>
            onChange({ ...state, severity: e.target.value as FiltersState['severity'] })
          }
          wrapperClassName="w-36"
        >
          <option value="">Toutes</option>
          <option value="info">🔵 Info</option>
          <option value="warn">🟠 Warn</option>
          <option value="error">🔴 Error</option>
        </Select>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="filter-since"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Du
        </label>
        <Input
          id="filter-since"
          name="since"
          type="datetime-local"
          value={state.since}
          onChange={(e) => onChange({ ...state, since: e.target.value })}
          className="w-48"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="filter-until"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Au
        </label>
        <Input
          id="filter-until"
          name="until"
          type="datetime-local"
          value={state.until}
          onChange={(e) => onChange({ ...state, until: e.target.value })}
          className="w-48"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={disabled}>
          Filtrer
        </Button>
        {active > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={disabled}
            aria-label={`Réinitialiser ${active} filtre${active > 1 ? 's' : ''}`}
            title="Réinitialiser"
          >
            ✕ {active}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function SkeletonRow({ index }: { readonly index: number }): ReactElement {
  return (
    <tr
      className={
        index % 2 === 0 ? 'border-b border-border' : 'border-b border-border bg-surface-active/15'
      }
    >
      <td className="px-3 py-3">
        <span className="block h-3 w-24 animate-pulse rounded bg-surface-active" />
      </td>
      <td className="px-3 py-3">
        <span className="block h-5 w-32 animate-pulse rounded bg-surface-active" />
      </td>
      <td className="px-3 py-3">
        <span className="block h-3 w-44 animate-pulse rounded bg-surface-active" />
      </td>
      <td className="px-3 py-3">
        <span className="block h-5 w-14 animate-pulse rounded bg-surface-active" />
      </td>
      <td className="px-3 py-3">
        <span className="block h-3 w-full animate-pulse rounded bg-surface-active" />
      </td>
    </tr>
  );
}

interface AuditRowProps {
  readonly item: AuditLogItemDto;
  readonly index: number;
  readonly onSelect: (item: AuditLogItemDto) => void;
}

function AuditRow({ item, index, onSelect }: AuditRowProps): ReactElement {
  const date = formatRelativeDate(item.createdAt);
  const action = splitAction(item.action);
  const sevMeta = SEVERITY_BADGE[item.severity];
  const actorMeta = ACTOR_BADGE[item.actorType];
  const meta = metadataPreview(item.metadata);
  const tooltip = metadataTooltip(item.metadata);

  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(item);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: HTML interdit `<button>` comme enfant direct de `<tbody>` ; on conserve `<tr>` avec role="button" + tabIndex + handlers clavier (motif standard pour table-row clickable).
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={onKeyDown}
      aria-label={`Détails de l'entrée audit ${item.action} du ${item.createdAt}`}
      className={
        index % 2 === 0
          ? 'cursor-pointer border-b border-border align-top transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary'
          : 'cursor-pointer border-b border-border bg-surface-active/15 align-top transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary'
      }
    >
      <td className="px-3 py-3 text-xs text-muted-foreground" title={item.createdAt}>
        <span className="block whitespace-nowrap text-foreground">{date.primary}</span>
        <time dateTime={item.createdAt} className="block font-mono text-[10px]">
          {item.createdAt.slice(0, 16).replace('T', ' ')}
        </time>
      </td>
      <td className="px-3 py-3">
        <Badge
          variant={actorMeta.variant}
          className="font-normal"
          title={item.actorId ?? undefined}
        >
          <span className="mr-1" aria-hidden="true">
            {actorMeta.icon}
          </span>
          {actorMeta.label(item.actorId)}
        </Badge>
      </td>
      <td className="px-3 py-3 font-mono text-xs">
        {action.namespace ? (
          <>
            <span className="text-muted-foreground">{action.namespace}</span>
            <span className="text-foreground">{action.suffix}</span>
          </>
        ) : (
          <span className="text-foreground">{action.suffix}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <Badge variant={sevMeta.variant} className="gap-1">
          <span aria-hidden="true">{sevMeta.symbol}</span>
          {item.severity}
        </Badge>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground" title={tooltip || undefined}>
        <span className="line-clamp-2">{meta}</span>
      </td>
    </tr>
  );
}

function AuditDetailDrawer({
  item,
  onClose,
}: {
  readonly item: AuditLogItemDto | null;
  readonly onClose: () => void;
}): ReactElement {
  const action = item !== null ? splitAction(item.action) : { namespace: '', suffix: '' };
  const sevMeta = item !== null ? SEVERITY_BADGE[item.severity] : null;
  const actorMeta = item !== null ? ACTOR_BADGE[item.actorType] : null;
  const metaEntries = item !== null ? Object.entries(item.metadata) : [];
  const formatted =
    item !== null && metaEntries.length > 0 ? JSON.stringify(item.metadata, null, 2) : '';

  return (
    <Drawer
      open={item !== null}
      onClose={onClose}
      title={item !== null ? item.action : ''}
      size="xl"
      {...(item !== null
        ? { subtitle: `${formatRelativeDate(item.createdAt).primary} · ${item.id}` }
        : {})}
    >
      {item !== null && sevMeta !== null && actorMeta !== null ? (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sevMeta.variant} className="gap-1">
              <span aria-hidden="true">{sevMeta.symbol}</span>
              {item.severity}
            </Badge>
            <Badge variant={actorMeta.variant} className="font-normal">
              <span className="mr-1" aria-hidden="true">
                {actorMeta.icon}
              </span>
              {actorMeta.label(item.actorId)}
            </Badge>
          </div>

          <DetailSection title="Action">
            <p className="font-mono text-xs">
              {action.namespace ? (
                <>
                  <span className="text-muted-foreground">{action.namespace}</span>
                  <span className="text-foreground">{action.suffix}</span>
                </>
              ) : (
                <span className="text-foreground">{action.suffix}</span>
              )}
            </p>
          </DetailSection>

          <DetailSection title="Acteur">
            <DetailKv label="Type" value={item.actorType} />
            <DetailKv label="Identifiant" value={item.actorId ?? '—'} mono />
          </DetailSection>

          <DetailSection title="Horodatage">
            <DetailKv
              label="Date"
              value={`${item.createdAt.slice(0, 19).replace('T', ' ')} UTC`}
              mono
            />
            <DetailKv label="Relatif" value={formatRelativeDate(item.createdAt).primary} />
            <DetailKv label="ID entrée" value={item.id} mono />
          </DetailSection>

          <DetailSection title="Métadonnées">
            {metaEntries.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Cette entrée ne porte aucune métadonnée.
              </p>
            ) : (
              <pre className="max-h-96 overflow-auto rounded-md bg-rail p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {formatted}
              </pre>
            )}
          </DetailSection>
        </div>
      ) : null}
    </Drawer>
  );
}

function DetailSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function DetailKv({
  label,
  value,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-foreground ${mono ? 'font-mono text-xs' : 'text-sm'}`}
      >
        {value}
      </span>
    </div>
  );
}

// --- Main AuditView ---

/**
 * Vue audit complète : barre de filtres compacte, table à scroll
 * infini, sidebar de stats. Le scroll infini observe une sentinelle
 * placée en bas du tableau ; quand elle entre dans le viewport et
 * qu'un cursor est dispo, on appelle la server action `loadAuditPage`
 * et on appende les nouveaux items. Filtrage = reset complet.
 */
export function AuditView({
  guildId,
  initialItems,
  initialNextCursor,
  initialFilters,
  knownActions,
  lockedFilters,
}: AuditViewProps): ReactElement {
  const [draft, setDraft] = useState<FiltersState>(() => filtersFromInitial(initialFilters));
  const [applied, setApplied] = useState<FiltersState>(() => filtersFromInitial(initialFilters));
  const [items, setItems] = useState<readonly AuditLogItemDto[]>(initialItems);
  const [cursor, setCursor] = useState<string | undefined>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<readonly string[]>(knownActions);
  const [selected, setSelected] = useState<AuditLogItemDto | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Token incrémenté à chaque (re)filtrage — un fetch en cours qui
  // termine après un nouveau filtrage est ignoré pour éviter de
  // mélanger les pages d'anciens filtres.
  const requestTokenRef = useRef(0);

  /** Merge des filtres "verrouillés" + filtres user — verrouillés gagnent. */
  const mergeLocked = useCallback(
    (filters: AuditFilters): AuditFilters =>
      lockedFilters !== undefined ? { ...filters, ...lockedFilters } : filters,
    [lockedFilters],
  );

  const onApplyFilters = useCallback(async () => {
    const token = ++requestTokenRef.current;
    setApplied(draft);
    setLoading(true);
    setError(null);
    try {
      const result = await loadAuditPage(guildId, mergeLocked(toApiFilters(draft)));
      if (token !== requestTokenRef.current) return;
      setItems(result.items);
      setCursor(result.nextCursor);
      setActions(Array.from(new Set(result.items.map((i) => i.action))).sort());
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      if (token === requestTokenRef.current) setLoading(false);
    }
  }, [guildId, draft, mergeLocked]);

  const onReset = useCallback(() => {
    const cleared: FiltersState = {
      action: '',
      actorType: '',
      severity: '',
      since: '',
      until: '',
    };
    setDraft(cleared);
    // re-applique automatiquement le reset
    requestTokenRef.current += 1;
    const token = requestTokenRef.current;
    setApplied(cleared);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await loadAuditPage(guildId, mergeLocked({}));
        if (token !== requestTokenRef.current) return;
        setItems(result.items);
        setCursor(result.nextCursor);
        setActions(Array.from(new Set(result.items.map((i) => i.action))).sort());
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
      } catch (err) {
        if (token !== requestTokenRef.current) return;
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        if (token === requestTokenRef.current) setLoading(false);
      }
    })();
  }, [guildId, mergeLocked]);

  // IntersectionObserver pour le scroll infini
  useEffect(() => {
    if (cursor === undefined) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loading) return;
        const token = requestTokenRef.current;
        setLoading(true);
        void (async () => {
          try {
            const result = await loadAuditPage(guildId, mergeLocked(toApiFilters(applied, cursor)));
            if (token !== requestTokenRef.current) return;
            setItems((prev) => [...prev, ...result.items]);
            setCursor(result.nextCursor);
            setActions((prev) =>
              Array.from(new Set([...prev, ...result.items.map((i) => i.action)])).sort(),
            );
          } catch (err) {
            if (token !== requestTokenRef.current) return;
            setError(err instanceof Error ? err.message : 'Erreur de chargement');
          } finally {
            if (token === requestTokenRef.current) setLoading(false);
          }
        })();
      },
      { root: scrollContainerRef.current, rootMargin: '200px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [guildId, cursor, loading, applied, mergeLocked]);

  const stats = useMemo(() => {
    const distinctActors = new Set<string>();
    for (const item of items) {
      if (item.actorId) distinctActors.add(`${item.actorType}:${item.actorId}`);
      else distinctActors.add(item.actorType);
    }
    const last = items[0];
    return {
      loaded: items.length,
      distinctActors: distinctActors.size,
      lastDate: last ? formatRelativeDate(last.createdAt).primary : '—',
    };
  }, [items]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
      <div className="flex min-h-0 flex-col gap-3 lg:col-span-7">
        <FiltersBar
          state={draft}
          onChange={setDraft}
          onSubmit={() => void onApplyFilters()}
          onReset={onReset}
          knownActions={actions}
          disabled={loading}
        />

        {error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div
          ref={scrollContainerRef}
          className="max-h-[calc(100vh-22rem)] overflow-y-auto rounded-lg border border-border bg-card"
        >
          {items.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <span aria-hidden="true" className="text-4xl opacity-40">
                🔍
              </span>
              <p className="text-sm font-medium">Aucune entrée trouvée</p>
              <p className="max-w-md text-center text-xs">
                Essayez d'élargir la fenêtre temporelle ou de modifier les filtres.
              </p>
              {activeFilterCount(applied) > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={onReset}>
                  Réinitialiser les filtres
                </Button>
              ) : null}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-active/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Acteur
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Sévérité
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Détails
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <AuditRow key={item.id} item={item} index={idx} onSelect={setSelected} />
                ))}
                {loading && cursor !== undefined ? (
                  <>
                    <SkeletonRow index={items.length} />
                    <SkeletonRow index={items.length + 1} />
                    <SkeletonRow index={items.length + 2} />
                  </>
                ) : null}
              </tbody>
            </table>
          )}
          {/* Sentinelle pour l'IntersectionObserver — invisible */}
          <div ref={sentinelRef} aria-hidden="true" className="h-1" />
        </div>

        <div className="text-center text-xs text-muted-foreground">
          {cursor === undefined && items.length > 0 ? (
            <span>
              ✓ Toutes les entrées sont chargées · {items.length} entrée
              {items.length > 1 ? 's' : ''} au total
            </span>
          ) : loading && items.length > 0 ? (
            <span>Chargement…</span>
          ) : null}
        </div>
      </div>

      <aside className="lg:col-span-3">
        <div className="sticky top-6 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Résumé</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Entrées chargées</span>
                <span className="font-mono text-foreground">{stats.loaded}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Dernière action</span>
                <span className="truncate text-foreground">{stats.lastDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Acteurs distincts</span>
                <span className="font-mono text-foreground">{stats.distinctActors}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Filtres actifs</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {activeFilterCount(applied) === 0 ? (
                <p>Aucun filtre actif — toutes les entrées sont affichées.</p>
              ) : (
                <ul className="space-y-1">
                  {applied.action.length > 0 ? (
                    <li>
                      <span className="text-muted-foreground">action :</span>{' '}
                      <code className="text-foreground">{applied.action}</code>
                    </li>
                  ) : null}
                  {applied.actorType !== '' ? (
                    <li>
                      <span className="text-muted-foreground">acteur :</span>{' '}
                      <span className="text-foreground">{applied.actorType}</span>
                    </li>
                  ) : null}
                  {applied.severity !== '' ? (
                    <li>
                      <span className="text-muted-foreground">sévérité :</span>{' '}
                      <span className="text-foreground">{applied.severity}</span>
                    </li>
                  ) : null}
                  {applied.since.length > 0 ? (
                    <li>
                      <span className="text-muted-foreground">depuis :</span>{' '}
                      <span className="text-foreground">{applied.since}</span>
                    </li>
                  ) : null}
                  {applied.until.length > 0 ? (
                    <li>
                      <span className="text-muted-foreground">jusqu'à :</span>{' '}
                      <span className="text-foreground">{applied.until}</span>
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">À propos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rétention</span>
                <span className="font-mono text-foreground">30 jours</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pagination</span>
                <span className="text-foreground">Cursor-based</span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Les entrées sont immuables et ordonnées du plus récent au plus ancien.
              </p>
            </CardContent>
          </Card>
        </div>
      </aside>

      <AuditDetailDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
