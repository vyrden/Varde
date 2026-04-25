'use client';

import { Button } from '@varde/ui';
import { useMemo, useState, useTransition } from 'react';

import { previewWelcomeCard, type WelcomeConfigClient } from '../../lib/welcome-actions';
import { renderTemplateClient } from './templates';

type Block = WelcomeConfigClient['welcome'] | WelcomeConfigClient['goodbye'];

export interface DiscordMessagePreviewProps {
  readonly guildId: string;
  readonly block: Block;
  readonly variant: 'welcome' | 'goodbye';
}

const SAMPLE_VARS = {
  user: 'Alice',
  userMention: '<@123>',
  userTag: 'Alice',
  guild: 'Aperçu',
  memberCount: 42,
  accountAgeDays: 365,
};

const renderInlineMarkdown = (raw: string): string => {
  // Très minimaliste : on neutralise le HTML, puis on passe **bold**,
  // *italic*, `code`, et on transforme `<@id>` en mention bleu Discord.
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = escapeHtml(raw);
  out = out.replace(
    /&lt;@(\d+)&gt;/g,
    '<span class="rounded bg-[#3a3c89] px-1 text-[#dee0fc]">@Alice</span>',
  );
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/`([^`]+?)`/g, '<code class="rounded bg-[#2b2d31] px-1">$1</code>');
  out = out.replace(/\n/g, '<br />');
  return out;
};

const formatNow = (): string => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `Aujourd'hui à ${hh}:${mm}`;
};

/**
 * Aperçu façon Discord du message qui sera posté : avatar bot, badge BOT,
 * timestamp, contenu rendu (markdown léger), embed coloré et carte
 * d'avatar attachée. La carte est récupérée à la demande via la route
 * preview-card (qui prend en compte l'image de fond persistée).
 */
export function DiscordMessagePreview({ guildId, block, variant }: DiscordMessagePreviewProps) {
  const [cardDataUrl, setCardDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const renderedContent = useMemo(
    () => renderTemplateClient(block.message, SAMPLE_VARS),
    [block.message],
  );
  const messageHtml = useMemo(() => renderInlineMarkdown(renderedContent), [renderedContent]);

  const refreshCard = () => {
    setError(null);
    if (!block.card.enabled) {
      setCardDataUrl(null);
      return;
    }
    startTransition(async () => {
      const result = await previewWelcomeCard(guildId, {
        title: variant === 'welcome' ? 'Bienvenue, Alice !' : 'Au revoir, Alice',
        subtitle: variant === 'welcome' ? 'Tu es le 42ᵉ membre' : '41 membres restants',
        backgroundColor: block.card.backgroundColor,
        backgroundTarget: variant,
      });
      if (result.ok) setCardDataUrl(result.dataUrl);
      else setError(result.reason);
    });
  };

  const embedColor = `#${block.embed.color.replace('#', '')}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Aperçu Discord</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={refreshCard}
          disabled={pending}
        >
          {pending ? 'Rendu…' : 'Actualiser'}
        </Button>
      </div>

      {/* Cadre Discord */}
      <div className="rounded-lg bg-[#313338] p-4 font-sans text-[#dbdee1]">
        <div className="flex gap-3">
          {/* Avatar bot — placeholder coloré V */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-sm font-semibold text-white">
            V
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            {/* Header */}
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-white">Varde</span>
              <span className="rounded bg-[#5865F2] px-1 text-[10px] font-semibold uppercase text-white">
                Bot
              </span>
              <span className="text-[11px] text-[#949ba4]">{formatNow()}</span>
            </div>

            {/* Contenu texte (uniquement si pas d'embed — Discord a la même règle) */}
            {!block.embed.enabled ? (
              <p
                className="text-sm leading-snug"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendu côté client, source = config admin (lui-même)
                dangerouslySetInnerHTML={{ __html: messageHtml }}
              />
            ) : null}

            {/* Embed */}
            {block.embed.enabled ? (
              <div
                className="mt-1 max-w-md overflow-hidden rounded-r-sm border-l-4 bg-[#2b2d31]"
                style={{ borderLeftColor: embedColor }}
              >
                <div className="space-y-2 p-3">
                  <p
                    className="text-sm leading-snug"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendu côté client, source = config admin (lui-même)
                    dangerouslySetInnerHTML={{ __html: messageHtml }}
                  />
                  {block.card.enabled && cardDataUrl !== null ? (
                    // biome-ignore lint/performance/noImgElement: aperçu data URL
                    <img
                      src={cardDataUrl}
                      alt=""
                      className="w-full rounded-sm"
                      width={700}
                      height={250}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Carte attachée hors embed */}
            {!block.embed.enabled && block.card.enabled ? (
              cardDataUrl !== null ? (
                // biome-ignore lint/performance/noImgElement: aperçu data URL
                <img
                  src={cardDataUrl}
                  alt=""
                  className="mt-1 max-w-md rounded-md"
                  width={700}
                  height={250}
                />
              ) : (
                <p className="mt-1 text-xs text-[#949ba4] italic">
                  Clique « Actualiser » pour générer la carte.
                </p>
              )
            ) : null}
          </div>
        </div>
      </div>

      {error !== null ? <p className="text-xs text-destructive">Échec : {error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Aperçu avec données fictives (Alice, 42 membres). Pour un test grandeur nature, utilise le
        bouton « Tester » qui envoie un vrai message dans Discord.
      </p>
    </div>
  );
}
