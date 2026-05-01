'use client';

import type { ChangeEvent, DragEvent, ReactElement } from 'react';
import { useRef, useState } from 'react';

/**
 * Drop zone réutilisable pour upload d'image (avatar / bannière)
 * (jalon 7 PR 7.7 / 7.8). Accepte clic OU glisser-déposer, valide
 * les types supportés et la taille maximale côté client, expose la
 * data URI au parent via `onLoaded` / `onCleared`.
 *
 * `aspect` détermine le ratio visuel de la zone : `square` pour un
 * avatar, `wide` pour une bannière. La miniature affichée après
 * upload reflète ce ratio.
 */

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);
const MAX_BYTES = 2 * 1024 * 1024;

const readFileAsDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader.result n est pas une string'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader a échoué'));
    reader.readAsDataURL(file);
  });

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

type FileError =
  | { readonly kind: 'unsupported_type' }
  | { readonly kind: 'too_large'; readonly size: number };

export interface ImageDropZoneCopy {
  readonly label: string;
  readonly hint: string;
  readonly dropPrompt: string;
  readonly remove: string;
  readonly errorUnsupportedType: string;
  readonly errorTooLarge: string;
}

export interface ImageDropZoneProps {
  readonly testIdPrefix: string;
  readonly aspect: 'square' | 'wide';
  readonly copy: ImageDropZoneCopy;
  /**
   * Notifié avec la data URI du fichier valide. Le parent persiste
   * cette URI dans un hidden input du form pour POST.
   */
  readonly onLoaded: (dataUri: string) => void;
  /** Notifié quand l'admin retire ou échoue à uploader. */
  readonly onCleared: () => void;
}

export function ImageDropZone({
  testIdPrefix,
  aspect,
  copy,
  onLoaded,
  onCleared,
}: ImageDropZoneProps): ReactElement {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<FileError | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = async (file: File): Promise<void> => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError({ kind: 'unsupported_type' });
      setDataUri(null);
      setFileMeta(null);
      onCleared();
      return;
    }
    if (file.size > MAX_BYTES) {
      setError({ kind: 'too_large', size: file.size });
      setDataUri(null);
      setFileMeta(null);
      onCleared();
      return;
    }
    try {
      const uri = await readFileAsDataUri(file);
      setDataUri(uri);
      setFileMeta({ name: file.name, size: file.size });
      setError(null);
      onLoaded(uri);
    } catch {
      setDataUri(null);
      setFileMeta(null);
      onCleared();
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      setDataUri(null);
      setFileMeta(null);
      onCleared();
      return;
    }
    await ingest(file);
  };

  const handleDrop = async (event: DragEvent<HTMLButtonElement>): Promise<void> => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await ingest(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleRemove = (): void => {
    setDataUri(null);
    setFileMeta(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onCleared();
  };

  const dropZoneClass = `flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
    isDragging
      ? 'border-primary bg-primary/10'
      : dataUri !== null
        ? 'border-emerald-500/60 bg-emerald-500/10'
        : 'border-border-muted bg-card-muted/30 hover:border-primary hover:bg-card-muted/50'
  }`;

  const thumbClass =
    aspect === 'wide'
      ? 'h-12 w-32 rounded-md border border-border-muted object-cover'
      : 'h-14 w-14 rounded-md border border-border-muted object-cover';

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{copy.label}</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`${dropZoneClass} w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        data-testid={`${testIdPrefix}-dropzone`}
      >
        {dataUri !== null && fileMeta !== null ? (
          <div className="flex items-center gap-3">
            {/* biome-ignore lint/performance/noImgElement: data URI thumbnail, not an external asset */}
            <img
              src={dataUri}
              alt=""
              className={thumbClass}
              data-testid={`${testIdPrefix}-dropzone-preview`}
            />
            <div className="flex flex-col items-start text-left">
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-500">
                <span aria-hidden="true">✓</span>
                <span>{fileMeta.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">{formatFileSize(fileMeta.size)}</span>
            </div>
          </div>
        ) : (
          <>
            <span aria-hidden="true" className="text-2xl text-muted-foreground">
              📎
            </span>
            <span className="text-sm text-muted-foreground">{copy.dropPrompt}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        onChange={handleFileChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      {dataUri !== null ? (
        <button
          type="button"
          onClick={handleRemove}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {copy.remove}
        </button>
      ) : null}
      {error !== null ? (
        <p
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
          role="alert"
          data-testid={`${testIdPrefix}-file-error`}
        >
          {error.kind === 'unsupported_type'
            ? copy.errorUnsupportedType
            : copy.errorTooLarge.replace('{size}', formatFileSize(error.size))}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{copy.hint}</p>
    </div>
  );
}
