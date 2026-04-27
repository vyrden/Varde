'use client';

import { Button } from '@varde/ui';
import { useEffect, useRef, useState, useTransition } from 'react';

import {
  deleteWelcomeBackground,
  fetchWelcomeBackgroundDataUrl,
  uploadWelcomeBackground,
} from '../../lib/welcome-actions';

export interface BackgroundImageInputProps {
  readonly guildId: string;
  readonly target: 'welcome' | 'goodbye';
  /** Chemin relatif persisté (ou null si aucune image). */
  readonly currentPath: string | null;
  /** Callback quand l'image change : `null` = supprimée, sinon nouveau chemin. */
  readonly onChange: (relativePath: string | null) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });

/**
 * Input de fichier + thumbnail + bouton retirer pour l'image de fond
 * d'une carte. L'upload encode le fichier en data URL côté client puis
 * envoie au serveur via uploadWelcomeBackground. La suppression est
 * idempotente.
 */
export function BackgroundImageInput({
  guildId,
  target,
  currentPath,
  onChange,
}: BackgroundImageInputProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Charge la thumbnail au mount / quand le chemin persisté change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: target/guildId stables ici
  useEffect(() => {
    if (currentPath === null) {
      setThumbnail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const dataUrl = await fetchWelcomeBackgroundDataUrl(guildId, target);
      if (!cancelled) setThumbnail(dataUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  const handleFile = async (file: File) => {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError('Format non supporté (PNG, JPEG, WEBP uniquement).');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image trop lourde (max ${MAX_BYTES / 1024 / 1024} Mo).`);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await fileToDataUrl(file);
    } catch (err) {
      setError(`Lecture du fichier échouée : ${err instanceof Error ? err.message : ''}`);
      return;
    }
    startTransition(async () => {
      const result = await uploadWelcomeBackground(guildId, target, dataUrl);
      if (result.ok) {
        onChange(result.relativePath);
        // Affiche la nouvelle image directement (évite un fetch supplémentaire).
        setThumbnail(dataUrl);
      } else {
        setError(`Upload échoué : ${result.detail ?? result.reason}`);
      }
    });
  };

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteWelcomeBackground(guildId, target);
      if (result.ok) {
        onChange(null);
        setThumbnail(null);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        setError('Suppression échouée.');
      }
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">Image de fond personnalisée</p>
      {thumbnail !== null ? (
        // biome-ignore lint/performance/noImgElement: thumbnail data URL, next/image overkill
        <img
          src={thumbnail}
          alt="Fond actuel"
          className={`h-20 w-56 rounded-md border border-border object-cover transition-opacity duration-150 ${pending ? 'opacity-50' : ''}`}
        />
      ) : pending ? (
        <span
          role="status"
          aria-label="Upload en cours"
          className="block h-20 w-56 animate-pulse rounded-md bg-surface-active"
        />
      ) : (
        <div className="h-20 w-56 rounded-md border border-dashed border-border bg-muted/40" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          disabled={pending}
          className="text-xs file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs hover:file:bg-muted"
        />
        {currentPath !== null ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleDelete}
            disabled={pending}
          >
            Retirer
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        PNG / JPEG / WEBP, 5 Mo max. L'image couvre la carte (rognée au centre) ; un voile sombre
        est appliqué pour la lisibilité du texte.
      </p>
      {error !== null ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
