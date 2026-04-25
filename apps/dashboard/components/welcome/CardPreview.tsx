'use client';

import { Button } from '@varde/ui';
import { useState, useTransition } from 'react';

import { previewWelcomeCard } from '../../lib/welcome-actions';

export interface CardPreviewProps {
  readonly guildId: string;
  readonly backgroundColor: string;
  readonly variant: 'welcome' | 'goodbye';
}

export function CardPreview({ guildId, backgroundColor, variant }: CardPreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handlePreview = () => {
    setReason(null);
    startTransition(async () => {
      const result = await previewWelcomeCard(guildId, {
        title: variant === 'welcome' ? 'Bienvenue, Alice !' : 'Au revoir, Alice',
        subtitle: variant === 'welcome' ? 'Tu es le 42ᵉ membre' : '41 membres restants',
        backgroundColor,
        backgroundTarget: variant,
      });
      if (result.ok) {
        setDataUrl(result.dataUrl);
      } else {
        setDataUrl(null);
        setReason(result.reason);
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={handlePreview}
        disabled={pending}
      >
        {pending ? 'Rendu…' : 'Aperçu de la carte'}
      </Button>
      {reason !== null ? (
        <p className="text-xs text-destructive">Échec de la preview : {reason}</p>
      ) : null}
      {dataUrl !== null ? (
        // biome-ignore lint/performance/noImgElement: data URL preview, next/image overkill
        <img
          src={dataUrl}
          alt="Aperçu de la carte d'accueil"
          className="rounded-md border border-border"
          width={700}
          height={250}
        />
      ) : null}
    </div>
  );
}
