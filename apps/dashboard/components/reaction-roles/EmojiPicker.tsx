'use client';

import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CustomEmojiOption, EmojiCatalog } from './ReactionRolesConfigEditor';
import { UNICODE_EMOJI_CATEGORIES, type UnicodeEmoji } from './unicode-emojis';

export interface EmojiPickerProps {
  readonly catalog: EmojiCatalog;
  readonly onPick: (raw: string) => void;
  readonly onClose: () => void;
}

const RECENT_STORAGE_KEY = 'varde:rr:recent-emojis';
const RECENT_MAX = 24;

/**
 * Construit la forme `<:name:id>` (ou `<a:name:id>`) qu'on injecte
 * dans le champ texte de la paire — c'est la forme parsée par
 * `parseEmoji` côté éditeur.
 */
const formatCustomEmoji = (e: CustomEmojiOption): string =>
  e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;

const cdnUrl = (e: CustomEmojiOption): string =>
  `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=32&quality=lossless`;

const matchCustom = (e: CustomEmojiOption, q: string): boolean =>
  q === '' || e.name.toLowerCase().includes(q) || (e.guildName ?? '').toLowerCase().includes(q);

/** Lecture mémoïsée des emojis récents depuis localStorage. */
const loadRecents = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const saveRecents = (recents: readonly string[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recents.slice(0, RECENT_MAX)));
  } catch {
    // localStorage indisponible (mode privé strict, quota plein) — on
    // ignore silencieusement, l'historique n'est qu'une commodité.
  }
};

/** Icônes catégorie compactes (style Discord, traits minces). */
const CATEGORY_ICON: Readonly<Record<string, ReactElement>> = {
  recent: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 5.5V9l2.2 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  smileys: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6.5" cy="7.5" r="0.9" fill="currentColor" />
      <circle cx="11.5" cy="7.5" r="0.9" fill="currentColor" />
      <path
        d="M6 11c.8 1.2 2 1.8 3 1.8s2.2-.6 3-1.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  people: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 4l-1.4 4L4 8.4l3 2.5L6.2 15 9 13l2.8 2L11 10.9l3-2.5-3.6-.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  animals: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M5 5.5c-1 1.5-1 3.5 0 5C5 12.5 6.5 14 9 14s4-1.5 4-3.5c1-1.5 1-3.5 0-5C12 4.5 11 4 9 4S6 4.5 5 5.5z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="7" cy="9" r="0.7" fill="currentColor" />
      <circle cx="11" cy="9" r="0.7" fill="currentColor" />
    </svg>
  ),
  food: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3 9.5c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M2.5 11h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  travel: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2v14M5 6l4-1.5L13 6M5 12l4 2 4-2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  activities: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 9h13M9 2.5v13M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  symbols: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 4.2c1-1.2 2.6-1.6 4-.8 1.7 1 1.7 3.6 0 5.6L9 14 5 9c-1.7-2-1.7-4.6 0-5.6 1.4-.8 3-.4 4 .8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  flags: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M4.5 2.5v13M4.5 3.5l8-1c1 0 1.5 1 1.5 2v4c0 1-.5 2-1.5 2l-8 1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  ),
  'server-current': (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 6v6M6 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  'server-external': (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6.5" y="5.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
};

interface RecentEntry {
  readonly raw: string;
  readonly display: string;
  readonly cdn?: string;
  readonly title: string;
}

/**
 * Picker d'emojis style Discord : sidebar de catégories à gauche
 * (icônes de saut), barre de recherche en haut, panneau scrollable à
 * droite avec sections sticky. Section « Récemment utilisés » en
 * haut, alimentée par localStorage (max 24).
 */
export function EmojiPicker({ catalog, onPick, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [activeCategory, setActiveCategory] = useState<string>('recent');

  // Click-outside et Escape pour fermer.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // Map des emojis pour résoudre rapidement un raw → entry « recent ».
  const customById = useMemo(() => {
    const map = new Map<string, CustomEmojiOption>();
    for (const e of catalog.current) map.set(e.id, e);
    for (const e of catalog.external) map.set(e.id, e);
    return map;
  }, [catalog]);

  const recentEntries: RecentEntry[] = useMemo(() => {
    return recents
      .map((raw): RecentEntry | null => {
        const customMatch = /^<a?:([^:]+):(\d{17,19})>$/.exec(raw);
        if (customMatch) {
          const id = customMatch[2] as string;
          const found = customById.get(id);
          if (!found) return null;
          return { raw, display: '', cdn: cdnUrl(found), title: `:${found.name}:` };
        }
        return { raw, display: raw, title: raw };
      })
      .filter((e): e is RecentEntry => e !== null);
  }, [recents, customById]);

  const recordPick = useCallback(
    (raw: string) => {
      onPick(raw);
      setRecents((prev) => {
        const next = [raw, ...prev.filter((r) => r !== raw)].slice(0, RECENT_MAX);
        saveRecents(next);
        return next;
      });
      onClose();
    },
    [onPick, onClose],
  );

  // Filtrage par recherche.
  const filteredUnicode = useMemo(() => {
    if (!isSearching) return UNICODE_EMOJI_CATEGORIES;
    return UNICODE_EMOJI_CATEGORIES.map((cat) => ({
      ...cat,
      emojis: cat.emojis.filter(
        (e: UnicodeEmoji) =>
          e.char.includes(trimmedQuery) || e.keywords.some((k) => k.includes(trimmedQuery)),
      ),
    })).filter((cat) => cat.emojis.length > 0);
  }, [isSearching, trimmedQuery]);

  const filteredCurrent = useMemo(
    () => catalog.current.filter((e) => matchCustom(e, trimmedQuery)),
    [catalog.current, trimmedQuery],
  );
  const filteredExternal = useMemo(
    () => catalog.external.filter((e) => matchCustom(e, trimmedQuery)),
    [catalog.external, trimmedQuery],
  );

  const externalByGuild = useMemo(() => {
    const groups = new Map<string, CustomEmojiOption[]>();
    for (const e of filteredExternal) {
      const key = e.guildName ?? '?';
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredExternal]);

  // Liste des sections présentes dans la sidebar, dans l'ordre de
  // rendu. La sidebar masque la section vide pour ne pas leurrer.
  const iconFor = (id: string): ReactElement => {
    return CATEGORY_ICON[id] ?? CATEGORY_ICON['smileys'] ?? <span />;
  };

  const sections: ReadonlyArray<{
    readonly id: string;
    readonly icon: ReactElement;
    readonly label: string;
    readonly visible: boolean;
  }> = [
    {
      id: 'recent',
      icon: iconFor('recent'),
      label: 'Récents',
      visible: !isSearching && recentEntries.length > 0,
    },
    ...(filteredCurrent.length > 0
      ? [
          {
            id: 'server-current',
            icon: iconFor('server-current'),
            label: 'Ce serveur',
            visible: true,
          },
        ]
      : []),
    ...(externalByGuild.length > 0
      ? [
          {
            id: 'server-external',
            icon: iconFor('server-external'),
            label: 'Autres serveurs',
            visible: true,
          },
        ]
      : []),
    ...filteredUnicode.map((cat) => ({
      id: cat.id,
      icon: iconFor(cat.id),
      label: cat.label,
      visible: true,
    })),
  ];

  // Mise à jour de l'icône active suivant le scroll.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Prend la section la plus haute encore visible.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) {
          const id = (first.target as HTMLElement).dataset['sectionId'];
          if (id) setActiveCategory(id);
        }
      },
      { root, rootMargin: '0px 0px -75% 0px', threshold: 0 },
    );
    for (const el of sectionRefs.current.values()) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveCategory(id);
    }
  };

  const setSectionRef = (id: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  };

  const noResults =
    isSearching &&
    filteredUnicode.length === 0 &&
    filteredCurrent.length === 0 &&
    externalByGuild.length === 0;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 mt-1 flex w-90 flex-col rounded-lg border border-border bg-popover shadow-xl"
      role="dialog"
      aria-label="Sélecteur d'emoji"
    >
      {/* Search bar */}
      <div className="border-b border-border p-2">
        <input
          type="text"
          value={query}
          placeholder="Rechercher un emoji…"
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex h-72">
        {/* Sidebar de catégories */}
        {!isSearching ? (
          <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-muted/30 py-1.5">
            {sections
              .filter((s) => s.visible)
              .map((s) => {
                const active = activeCategory === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => scrollToSection(s.id)}
                    title={s.label}
                    aria-label={s.label}
                    aria-current={active ? 'true' : undefined}
                    className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    {s.icon}
                  </button>
                );
              })}
          </div>
        ) : null}

        {/* Panneau principal scrollable */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
          {noResults ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              Aucun résultat pour « {query} ».
            </p>
          ) : null}

          {!isSearching && recentEntries.length > 0 ? (
            <section
              ref={setSectionRef('recent')}
              data-section-id="recent"
              className="mb-2 scroll-mt-1"
            >
              <p className="sticky top-0 z-10 mb-1 bg-popover/95 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                Récents
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {recentEntries.map((e) => (
                  <button
                    key={`recent-${e.raw}`}
                    type="button"
                    onClick={() => recordPick(e.raw)}
                    title={e.title}
                    className="flex size-9 items-center justify-center rounded-md text-xl transition-colors hover:bg-surface-hover"
                  >
                    {e.cdn !== undefined ? (
                      // biome-ignore lint/performance/noImgElement: emoji CDN, next/image overkill
                      <img src={e.cdn} alt={e.title} className="size-6" />
                    ) : (
                      <span>{e.display}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {filteredCurrent.length > 0 ? (
            <section
              ref={setSectionRef('server-current')}
              data-section-id="server-current"
              className="mb-2 scroll-mt-1"
            >
              <p className="sticky top-0 z-10 mb-1 bg-popover/95 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                Ce serveur
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {filteredCurrent.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => recordPick(formatCustomEmoji(e))}
                    title={`:${e.name}:`}
                    className="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-surface-hover"
                  >
                    {/* biome-ignore lint/performance/noImgElement: emoji CDN, next/image overkill */}
                    <img src={cdnUrl(e)} alt={e.name} className="size-6" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {externalByGuild.length > 0 ? (
            <section
              ref={setSectionRef('server-external')}
              data-section-id="server-external"
              className="mb-2 scroll-mt-1"
            >
              <p className="sticky top-0 z-10 mb-1 bg-popover/95 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                Autres serveurs
              </p>
              {externalByGuild.map(([guildName, emojis]) => (
                <div key={guildName} className="mb-2">
                  <p className="mb-0.5 px-1 text-[10px] font-medium text-muted-foreground/80">
                    {guildName}
                  </p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {emojis.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => recordPick(formatCustomEmoji(e))}
                        title={`:${e.name}: (${guildName})`}
                        className="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-surface-hover"
                      >
                        {/* biome-ignore lint/performance/noImgElement: emoji CDN, next/image overkill */}
                        <img src={cdnUrl(e)} alt={e.name} className="size-6" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {filteredUnicode.map((cat) => (
            <section
              key={cat.id}
              ref={setSectionRef(cat.id)}
              data-section-id={cat.id}
              className="mb-2 scroll-mt-1"
            >
              <p className="sticky top-0 z-10 mb-1 bg-popover/95 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                {cat.label}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((e) => (
                  <button
                    key={e.char}
                    type="button"
                    onClick={() => recordPick(e.char)}
                    title={e.keywords[0] ?? ''}
                    className="flex size-9 items-center justify-center rounded-md text-xl transition-colors hover:bg-surface-hover"
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <p className="border-t border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        Astuce : tu peux aussi coller directement un emoji ou{' '}
        <code className="rounded bg-muted px-1">&lt;:nom:id&gt;</code> dans le champ.
      </p>
    </div>
  );
}
