'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { CustomEmojiOption, EmojiCatalog } from './ReactionRolesConfigEditor';
import { UNICODE_EMOJI_CATEGORIES, type UnicodeEmoji } from './unicode-emojis';

type Tab = 'unicode' | 'current' | 'external';

export interface EmojiPickerProps {
  readonly catalog: EmojiCatalog;
  readonly onPick: (raw: string) => void;
  readonly onClose: () => void;
}

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

/**
 * Picker d'emojis tabbé : Unicode (catalogue curé), serveur courant,
 * autres serveurs. Recherche instantanée par nom/mot-clé.
 */
export function EmojiPicker({ catalog, onPick, onClose }: EmojiPickerProps) {
  const [tab, setTab] = useState<Tab>('unicode');
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

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

  const filteredUnicode = useMemo(() => {
    if (trimmedQuery === '') return UNICODE_EMOJI_CATEGORIES;
    return UNICODE_EMOJI_CATEGORIES.map((cat) => ({
      ...cat,
      emojis: cat.emojis.filter(
        (e: UnicodeEmoji) =>
          e.char.includes(trimmedQuery) || e.keywords.some((k) => k.includes(trimmedQuery)),
      ),
    })).filter((cat) => cat.emojis.length > 0);
  }, [trimmedQuery]);

  const filteredCurrent = useMemo(
    () => catalog.current.filter((e) => matchCustom(e, trimmedQuery)),
    [catalog.current, trimmedQuery],
  );
  const filteredExternal = useMemo(
    () => catalog.external.filter((e) => matchCustom(e, trimmedQuery)),
    [catalog.external, trimmedQuery],
  );

  // Group external emojis by guild for display.
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

  return (
    <div
      ref={containerRef}
      className="absolute z-50 mt-1 w-80 rounded-md border border-border bg-popover p-2 shadow-lg"
      role="dialog"
      aria-label="Sélecteur d'emoji"
    >
      {/* Tabs */}
      <div className="mb-2 flex gap-1 border-b border-border pb-1 text-xs">
        <button
          type="button"
          onClick={() => setTab('unicode')}
          className={`rounded px-2 py-1 ${tab === 'unicode' ? 'bg-primary/10 font-medium' : 'hover:bg-muted'}`}
        >
          Unicode
        </button>
        <button
          type="button"
          onClick={() => setTab('current')}
          className={`rounded px-2 py-1 ${tab === 'current' ? 'bg-primary/10 font-medium' : 'hover:bg-muted'}`}
        >
          Ce serveur ({catalog.current.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('external')}
          className={`rounded px-2 py-1 ${tab === 'external' ? 'bg-primary/10 font-medium' : 'hover:bg-muted'}`}
        >
          Autres ({catalog.external.length})
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={query}
        placeholder="Rechercher…"
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 h-7 w-full rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {/* Body */}
      <div className="max-h-64 overflow-y-auto">
        {tab === 'unicode' ? (
          filteredUnicode.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Aucun résultat.</p>
          ) : (
            filteredUnicode.map((cat) => (
              <div key={cat.id} className="mb-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{cat.label}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.emojis.map((e) => (
                    <button
                      key={e.char}
                      type="button"
                      onClick={() => {
                        onPick(e.char);
                        onClose();
                      }}
                      title={e.keywords[0] ?? ''}
                      className="rounded p-1 text-xl hover:bg-muted"
                    >
                      {e.char}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )
        ) : tab === 'current' ? (
          filteredCurrent.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {catalog.current.length === 0
                ? "Ce serveur n'a pas d'emoji custom."
                : 'Aucun résultat.'}
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5">
              {filteredCurrent.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onPick(formatCustomEmoji(e));
                    onClose();
                  }}
                  title={`:${e.name}:`}
                  className="rounded p-1 hover:bg-muted"
                >
                  {/* biome-ignore lint/performance/noImgElement: emoji CDN, next/image overkill */}
                  <img src={cdnUrl(e)} alt={e.name} className="h-6 w-6" />
                </button>
              ))}
            </div>
          )
        ) : externalByGuild.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {catalog.external.length === 0
              ? 'Aucun emoji custom sur les autres serveurs où le bot est présent.'
              : 'Aucun résultat.'}
          </p>
        ) : (
          externalByGuild.map(([guildName, emojis]) => (
            <div key={guildName} className="mb-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{guildName}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {emojis.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      onPick(formatCustomEmoji(e));
                      onClose();
                    }}
                    title={`:${e.name}: (${guildName})`}
                    className="rounded p-1 hover:bg-muted"
                  >
                    {/* biome-ignore lint/performance/noImgElement: emoji CDN, next/image overkill */}
                    <img src={cdnUrl(e)} alt={e.name} className="h-6 w-6" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        Astuce : tu peux aussi coller directement un emoji ou un{' '}
        <code className="rounded bg-muted px-1">&lt;:nom:id&gt;</code> dans le champ.
      </p>
    </div>
  );
}
