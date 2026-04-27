'use client';

import { type ReactElement, type ReactNode, useMemo } from 'react';

import { cn } from '../lib/cn.js';

/**
 * Rendu fidèle d'un message Discord — header (avatar + nom bot + badge
 * BOT + timestamp), body markdown, attachments (réactions + boutons).
 *
 * Le rendu Markdown couvre le sous-ensemble Discord :
 * - **gras**, *italique*, __souligné__, ~~barré~~
 * - `code inline`
 * - blocs ``` ``` (multi-lignes)
 * - > citations (1 niveau)
 * - listes `- ` ou `1. `
 * - mentions `<@id>`, `<#id>`, `<@&id>` rendues comme chips bleues
 *
 * **Pas** de support : tables, HTML, footnotes, images embed, links
 * Markdown (`[txt](url)`). Pour ces cas, l'admin tape directement le
 * contenu ; Discord rendra le reste lui-même quand le message sera
 * publié.
 *
 * Sécurité : l'entrée est traitée comme du texte brut. Aucun HTML
 * brut n'est interprété — chaque token markdown produit des éléments
 * React, et le texte restant passe par `escapeHtml` avant d'être
 * inséré via `dangerouslySetInnerHTML` (utilisé uniquement pour les
 * spans markdown reconstruits, dont le contenu a été échappé en
 * amont). Mauvaise idée ? Plutôt : pour toute portion non-markdown,
 * on rend du texte React natif (jamais HTML).
 *
 * Réutilisable par tout module qui a besoin de prévisualiser un
 * message Discord (reaction-roles, welcome, futures features).
 */

export type DiscordButtonStyle = 'primary' | 'secondary' | 'success' | 'danger';

export interface DiscordPreviewReaction {
  readonly kind: 'reaction';
  /** Glyph ou texte court à afficher dans le badge. */
  readonly emoji: string;
  /** Compteur affiché à droite du glyph (défaut : 1). */
  readonly count?: number;
}

export interface DiscordPreviewButton {
  readonly kind: 'button';
  readonly emoji?: string;
  readonly label: string;
  readonly style: DiscordButtonStyle;
}

export type DiscordPreviewAttachment = DiscordPreviewReaction | DiscordPreviewButton;

/**
 * Embed Discord — block bordé à gauche en couleur, qui prend le pas
 * sur le contenu principal. Quand un embed est fourni :
 * - `content` reste affiché au-dessus (bot peut envoyer "regarde ↓"
 *   suivi d'un embed) — comportement Discord standard.
 * - `embed.content` est le contenu markdown rendu DANS le block bordé.
 * - `embed.color` colore la bordure gauche (hex avec ou sans `#`).
 */
export interface DiscordPreviewEmbed {
  readonly color: string;
  readonly content?: string;
}

export interface DiscordMessagePreviewProps {
  readonly botName: string;
  readonly botAvatarUrl?: string;
  /** Contenu markdown brut. */
  readonly content: string;
  /** Réactions et/ou boutons attachés au message. */
  readonly attachments?: ReadonlyArray<DiscordPreviewAttachment>;
  /** Texte de placeholder quand `content` est vide. */
  readonly emptyPlaceholder?: string;
  /** Mention discrète sous le message (« Aperçu indicatif… »). */
  readonly footnote?: ReactNode;
  /** Timestamp à droite du nom du bot. Format libre, défaut : « Aujourd'hui ». */
  readonly timestampLabel?: string;
  readonly className?: string;
  /**
   * Variables substituées dans `content` et `embed.content` avant
   * rendu Markdown. Format `{key}` → valeur. Permet à l'admin de
   * voir le résultat avec données d'exemple sans avoir à câbler
   * une logique de templating côté caller.
   */
  readonly variables?: Readonly<Record<string, string | number>>;
  /** Embed Discord coloré, attaché au message. */
  readonly embed?: DiscordPreviewEmbed;
  /**
   * URL d'image (data URL ou http) attachée au message. Affichée en
   * pied de message, ou DANS l'embed si `embed` est aussi fourni.
   */
  readonly cardImageUrl?: string | null;
  /**
   * Indique qu'une carte est en cours de génération côté serveur.
   * Affiche un placeholder pulsant à la place de l'image quand
   * `cardImageUrl === null`.
   */
  readonly cardLoading?: boolean;
}

const BUTTON_STYLE_CLASSES: Record<DiscordButtonStyle, string> = {
  primary: 'bg-[#5865f2] text-white hover:bg-[#4752c4]',
  secondary: 'bg-[#4e5058] text-white hover:bg-[#6d6f78]',
  success: 'bg-[#248046] text-white hover:bg-[#1a6334]',
  danger: 'bg-[#da373c] text-white hover:bg-[#a12828]',
};

/** Boutons rendus en rangées de 5 max (limite Discord). */
const MAX_BUTTONS_PER_ROW = 5;

/**
 * Échappement HTML safe — caractères réservés transformés en entités.
 * Utilisé sur tout texte injecté dans une chaîne HTML reconstruite
 * (lignes markdown processées avec `<strong>`, `<em>`, etc.).
 */
const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Rend le markdown inline d'une ligne (pas les blocs). Ordre des
 * remplacements important : code en premier (protège son contenu),
 * puis emphasis. Les mentions Discord sont rendues comme des chips.
 *
 * Renvoie une string HTML (qui sera injectée via `dangerouslySetInnerHTML`).
 * Tout texte original a été passé via `escapeHtml` en amont, et les
 * regex matchent des patterns markdown qui n'introduisent que des
 * tags HTML produits par cette fonction — pas d'XSS possible.
 */
const renderInlineMarkdown = (line: string): string => {
  let out = escapeHtml(line);

  // Code inline `...` — capturé en premier pour neutraliser son contenu.
  // Le contenu du code est déjà échappé (escapeHtml a été appliqué avant).
  out = out.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-[#2b2d31] px-1 py-0.5 font-mono text-[0.85em]">$1</code>',
  );

  // Mentions Discord : ordre rôle > user > channel pour éviter qu'une
  // mention de rôle (`<@&id>`) ne soit interprétée comme user (`<@id>`).
  out = out.replace(
    /&lt;@&amp;(\d{17,20})&gt;/g,
    '<span class="rounded bg-[#3c4270] px-1 text-[#dee0fc]">@rôle</span>',
  );
  out = out.replace(
    /&lt;@!?(\d{17,20})&gt;/g,
    '<span class="rounded bg-[#3c4270] px-1 text-[#dee0fc]">@membre</span>',
  );
  out = out.replace(
    /&lt;#(\d{17,20})&gt;/g,
    '<span class="rounded bg-[#3c4270] px-1 text-[#dee0fc]">#salon</span>',
  );

  // Emphasis : ordre fort → italique pour éviter que `*` simple
  // capture un `**bold**` partiellement. Le pattern bold tolère un
  // `*` simple à l'intérieur (italique imbriqué) en exigeant qu'il
  // ne soit pas suivi d'un autre `*` — sinon ce serait une fence de
  // fermeture du gras.
  out = out.replace(/\*\*((?:[^*]|\*(?!\*))+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<u>$1</u>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, '<em>$1</em>');

  return out;
};

/** Pour les blocs : on a déjà la string complète, on échappe puis on rend. */
const renderCodeBlock = (raw: string): string => {
  return `<pre class="my-1 overflow-x-auto rounded bg-[#2b2d31] p-2 font-mono text-xs"><code>${escapeHtml(raw)}</code></pre>`;
};

/**
 * Substitue les variables `{key}` dans un texte. Si `variables` est
 * vide ou absent, retourne le texte inchangé. Substitution récursive
 * non supportée — un seul niveau, comme côté welcome runtime.
 */
export function substituteVariables(
  raw: string,
  variables: Readonly<Record<string, string | number>> | undefined,
): string {
  if (variables === undefined) return raw;
  const keys = Object.keys(variables);
  if (keys.length === 0) return raw;
  return raw.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, key) => {
    const v = variables[key];
    if (v === undefined) return match;
    return String(v);
  });
}

/**
 * Renderer markdown ligne-par-ligne avec gestion basique des blocs
 * (code blocks ```, citations >, listes -/1.). Renvoie une chaîne
 * HTML composée de balises `<p>`, `<ul>`, `<ol>`, `<blockquote>`,
 * `<pre>`, et inline `<strong>`, `<em>`, etc.
 */
export function renderDiscordMarkdown(content: string): string {
  if (content.length === 0) return '';
  const lines = content.split('\n');
  const out: string[] = [];

  type ListState =
    | { kind: 'none' }
    | { kind: 'ul' }
    | { kind: 'ol' }
    | { kind: 'quote' }
    | { kind: 'code'; lang: string; buffer: string[] };

  let state: ListState = { kind: 'none' };

  const closeOpenBlock = (): void => {
    if (state.kind === 'ul') out.push('</ul>');
    else if (state.kind === 'ol') out.push('</ol>');
    else if (state.kind === 'quote') out.push('</blockquote>');
    else if (state.kind === 'code') out.push(renderCodeBlock(state.buffer.join('\n')));
    state = { kind: 'none' };
  };

  for (const line of lines) {
    // Bloc de code : on accumule jusqu'à la fence de fermeture.
    if (state.kind === 'code') {
      if (/^```\s*$/.test(line)) {
        out.push(renderCodeBlock(state.buffer.join('\n')));
        state = { kind: 'none' };
      } else {
        state.buffer.push(line);
      }
      continue;
    }

    const codeFenceOpen = /^```([a-z0-9]*)\s*$/i.exec(line);
    if (codeFenceOpen) {
      closeOpenBlock();
      state = { kind: 'code', lang: codeFenceOpen[1] ?? '', buffer: [] };
      continue;
    }

    const quoteMatch = /^&gt;\s?(.*)$/.exec(escapeHtml(line));
    // L'escapeHtml ci-dessus est appliqué uniquement pour le test
    // pattern (Discord utilise `> ` qui devient `&gt; ` une fois
    // échappé). On ne l'utilise pas pour la sortie.
    const isQuote = /^>\s?/.test(line);
    if (isQuote) {
      const inner = line.replace(/^>\s?/, '');
      if (state.kind !== 'quote') {
        closeOpenBlock();
        out.push('<blockquote class="border-l-4 border-[#4f545c] pl-2 text-[#b9bbbe]">');
        state = { kind: 'quote' };
      }
      out.push(`<p>${renderInlineMarkdown(inner)}</p>`);
      continue;
    }
    void quoteMatch; // suppress unused

    const ulMatch = /^[-*]\s+(.+)$/.exec(line);
    if (ulMatch) {
      if (state.kind !== 'ul') {
        closeOpenBlock();
        out.push('<ul class="list-disc pl-5">');
        state = { kind: 'ul' };
      }
      out.push(`<li>${renderInlineMarkdown(ulMatch[1] ?? '')}</li>`);
      continue;
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      if (state.kind !== 'ol') {
        closeOpenBlock();
        out.push('<ol class="list-decimal pl-5">');
        state = { kind: 'ol' };
      }
      out.push(`<li>${renderInlineMarkdown(olMatch[1] ?? '')}</li>`);
      continue;
    }

    if (line.trim().length === 0) {
      closeOpenBlock();
      continue;
    }

    if (state.kind !== 'none') closeOpenBlock();
    out.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeOpenBlock();
  return out.join('');
}

/**
 * Découpe les boutons en rangées de 5 (Discord rend 5 boutons par
 * action row, max 5 rows = 25 boutons).
 */
const chunkButtons = (buttons: ReadonlyArray<DiscordPreviewButton>): DiscordPreviewButton[][] => {
  const rows: DiscordPreviewButton[][] = [];
  for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
    rows.push(buttons.slice(i, i + MAX_BUTTONS_PER_ROW));
  }
  return rows;
};

export function DiscordMessagePreview({
  botName,
  botAvatarUrl,
  content,
  attachments = [],
  emptyPlaceholder = 'Contenu du message…',
  footnote,
  timestampLabel = "Aujourd'hui",
  className,
  variables,
  embed,
  cardImageUrl,
  cardLoading = false,
}: DiscordMessagePreviewProps): ReactElement {
  const reactions = attachments.filter((a): a is DiscordPreviewReaction => a.kind === 'reaction');
  const buttons = attachments.filter((a): a is DiscordPreviewButton => a.kind === 'button');
  const buttonRows = useMemo(() => chunkButtons(buttons), [buttons]);

  const substitutedContent = useMemo(
    () => substituteVariables(content, variables),
    [content, variables],
  );
  const substitutedEmbedContent = useMemo(
    () => (embed?.content !== undefined ? substituteVariables(embed.content, variables) : ''),
    [embed?.content, variables],
  );

  const renderedHtml = useMemo(
    () => renderDiscordMarkdown(substitutedContent),
    [substitutedContent],
  );
  const renderedEmbedHtml = useMemo(
    () =>
      substitutedEmbedContent.length > 0 ? renderDiscordMarkdown(substitutedEmbedContent) : '',
    [substitutedEmbedContent],
  );

  // Couleur d'embed normalisée (avec ou sans `#`).
  const embedColor =
    embed?.color !== undefined
      ? embed.color.startsWith('#')
        ? embed.color
        : `#${embed.color}`
      : undefined;

  const hasAnyAttachment =
    attachments.length > 0 ||
    embed !== undefined ||
    (cardImageUrl !== undefined && cardImageUrl !== null) ||
    cardLoading;
  const isEmpty = substitutedContent.length === 0 && !hasAnyAttachment;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="rounded-md bg-[#36393f] p-3 font-sans text-sm text-white">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#5865f2]">
            {botAvatarUrl !== undefined ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={botAvatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span aria-hidden="true" className="text-xs font-bold">
                {botName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-wrap items-baseline gap-1">
            <span className="text-sm font-semibold text-white">{botName}</span>
            <span className="rounded bg-[#5865f2] px-1 text-[10px] font-bold text-white">BOT</span>
            <span className="text-xs text-[#96989d]">{timestampLabel}</span>
          </div>
        </div>
        {isEmpty ? <p className="opacity-50">{emptyPlaceholder}</p> : null}
        {substitutedContent.length > 0 ? (
          <div
            className="discord-markdown wrap-break-word [&>blockquote]:my-1 [&>ol]:my-1 [&>p]:my-0.5 [&>p]:leading-snug [&>pre]:my-1 [&>ul]:my-1"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendu via renderDiscordMarkdown (sanitize via escapeHtml). Voir tests sécurité.
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : null}
        {embed !== undefined ? (
          <div
            className="mt-2 max-w-md overflow-hidden rounded-r-sm border-l-4 bg-[#2b2d31]"
            style={{ borderLeftColor: embedColor }}
          >
            <div className="space-y-2 p-3">
              {renderedEmbedHtml.length > 0 ? (
                <div
                  className="discord-markdown wrap-break-word [&>blockquote]:my-1 [&>ol]:my-1 [&>p]:my-0.5 [&>p]:leading-snug [&>pre]:my-1 [&>ul]:my-1"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendu via renderDiscordMarkdown (sanitize via escapeHtml). Voir tests sécurité.
                  dangerouslySetInnerHTML={{ __html: renderedEmbedHtml }}
                />
              ) : null}
              {cardImageUrl !== undefined && cardImageUrl !== null ? (
                <img
                  src={cardImageUrl}
                  alt=""
                  className="w-full rounded-sm"
                  width={700}
                  height={250}
                />
              ) : cardLoading ? (
                <span
                  role="status"
                  aria-label="Génération de la carte en cours"
                  className="block aspect-[7/2.5] w-full animate-pulse rounded-sm bg-[#404249]"
                />
              ) : null}
            </div>
          </div>
        ) : cardImageUrl !== undefined && cardImageUrl !== null ? (
          // Carte hors embed (le contenu principal est au-dessus, la
          // carte ferme le message comme une pièce jointe).
          <img
            src={cardImageUrl}
            alt=""
            className="mt-2 max-w-md rounded-md"
            width={700}
            height={250}
          />
        ) : cardLoading ? (
          <span
            role="status"
            aria-label="Génération de la carte en cours"
            className="mt-2 block aspect-[7/2.5] max-w-md animate-pulse rounded-md bg-[#404249]"
          />
        ) : null}
        {buttonRows.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {buttonRows.map((row, rowIdx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rangée stable par position
              <div key={rowIdx} className="flex flex-wrap gap-1.5">
                {row.map((b, btnIdx) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: bouton stable par position
                    key={btnIdx}
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${BUTTON_STYLE_CLASSES[b.style]}`}
                  >
                    {b.emoji !== undefined && b.emoji.length > 0 ? (
                      <span aria-hidden="true">{b.emoji}</span>
                    ) : null}
                    <span>{b.label.length > 0 ? b.label : 'Bouton'}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {reactions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {reactions.map((r, idx) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: réaction stable par position
                key={idx}
                className="inline-flex items-center gap-1 rounded bg-[#2f3136] px-1.5 py-0.5 text-base leading-none"
              >
                <span>{r.emoji}</span>
                <span className="text-xs text-[#dcddde]">{r.count ?? 1}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {footnote !== undefined ? <p className="text-xs text-muted-foreground">{footnote}</p> : null}
    </div>
  );
}
