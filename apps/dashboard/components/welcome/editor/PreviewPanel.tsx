'use client';

import { DiscordMessagePreview } from '@varde/ui';
import { type ReactElement, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { previewWelcomeCard } from '../../../lib/welcome-actions';
import type { AnyBlock, WelcomeVariant } from '../types';
import { SAMPLE_PREVIEW_VARIABLES } from '../welcome-config-helpers';

export interface PreviewPanelProps {
  readonly guildId: string;
  readonly block: AnyBlock;
  readonly variant: WelcomeVariant;
}

/**
 * Wrapper welcome-spécifique du `DiscordMessagePreview` générique.
 * Branche le fetch debouncé de la carte d'avatar via
 * `previewWelcomeCard` (route serveur qui rend la carte avec
 * `@napi-rs/canvas`) — pour ne pas balader cette logique côté
 * composant générique de `@varde/ui`.
 *
 * Auto-refresh debouncé : 500 ms après la dernière modif des champs
 * de carte (couleur, image, polices).
 */
export function PreviewPanel({ guildId, block, variant }: PreviewPanelProps): ReactElement {
  const [cardDataUrl, setCardDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastRequestId = useRef(0);

  // Clé déterministe — quand une de ces valeurs change, on relance.
  const cardKey = useMemo(
    () =>
      JSON.stringify({
        enabled: block.card.enabled,
        bg: block.card.backgroundColor,
        bgPath: block.card.backgroundImagePath,
        text: block.card.text,
      }),
    [
      block.card.enabled,
      block.card.backgroundColor,
      block.card.backgroundImagePath,
      block.card.text,
    ],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh manuel via cardKey
  useEffect(() => {
    if (!block.card.enabled) {
      setCardDataUrl(null);
      setError(null);
      return;
    }
    setError(null);
    const myId = ++lastRequestId.current;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const result = await previewWelcomeCard(guildId, {
          title: variant === 'welcome' ? 'Bienvenue, Alice !' : 'Au revoir, Alice',
          subtitle: variant === 'welcome' ? 'Tu es le 42ᵉ membre' : '41 membres restants',
          backgroundColor: block.card.backgroundColor,
          backgroundTarget: variant,
          text: block.card.text,
        });
        if (myId !== lastRequestId.current) return;
        if (result.ok) setCardDataUrl(result.dataUrl);
        else setError(result.reason);
      });
    }, 500);
    return () => clearTimeout(handle);
  }, [cardKey]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">
        Aperçu Discord{' '}
        <span className="text-muted-foreground">
          {pending ? '(rendu carte…)' : '(mise à jour automatique)'}
        </span>
      </p>
      <DiscordMessagePreview
        botName="Varde"
        // Comportement Discord : si embed activé, le message vit
        // dans l'embed coloré ; sinon, dans le body principal.
        content={block.embed.enabled ? '' : block.message}
        variables={SAMPLE_PREVIEW_VARIABLES}
        emptyPlaceholder={
          variant === 'welcome'
            ? "Tape ton message d'accueil pour le voir apparaître ici."
            : 'Tape ton message de départ pour le voir apparaître ici.'
        }
        {...(block.embed.enabled
          ? {
              embed: {
                color: block.embed.color,
                content: block.message,
              },
            }
          : {})}
        {...(block.card.enabled
          ? {
              cardImageUrl: cardDataUrl,
              cardLoading: pending && cardDataUrl === null,
            }
          : {})}
        footnote={
          <>
            Aperçu avec données fictives (Alice, 42 membres). Pour un test réel, utilise les boutons
            « Tester » dans la barre de sauvegarde.
          </>
        }
      />
      {error !== null ? <p className="text-xs text-destructive">Échec carte : {error}</p> : null}
    </div>
  );
}
