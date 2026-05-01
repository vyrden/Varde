import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ImageDropZone,
  type ImageDropZoneCopy,
  type ImageDropZoneProps,
} from '../../components/ImageDropZone';

const copy: ImageDropZoneCopy = {
  label: 'Avatar',
  hint: 'PNG, JPEG ou GIF max 2 Mo.',
  dropPrompt: 'Glissez ou cliquez',
  remove: 'Retirer',
  errorUnsupportedType: 'Format non supporté',
  errorTooLarge: 'Trop lourd ({size})',
};

const buildFile = (name: string, type: string, size: number, content: BlobPart = 'x'): File => {
  const file = new File([content], name, { type });
  if (file.size !== size) {
    Object.defineProperty(file, 'size', { value: size, configurable: true });
  }
  return file;
};

const renderZone = (overrides: Partial<ImageDropZoneProps> = {}) => {
  const onLoaded = vi.fn();
  const onCleared = vi.fn();
  render(
    <ImageDropZone
      testIdPrefix="test-drop"
      aspect="square"
      copy={copy}
      onLoaded={onLoaded}
      onCleared={onCleared}
      {...overrides}
    />,
  );
  return { onLoaded, onCleared };
};

const fakeReadAsDataURL = (result = 'data:image/png;base64,XXXX'): void => {
  // Override FileReader pour des tests synchrones — le composant
  // attend l'event `onload` qu'on déclenche manuellement.
  type ReaderLike = { result: unknown; onload: (() => void) | null; readAsDataURL: () => void };
  const proto = (globalThis.FileReader as unknown as { prototype: ReaderLike }).prototype;
  proto.readAsDataURL = function (this: ReaderLike): void {
    this.result = result;
    queueMicrotask(() => this.onload?.());
  };
};

describe('ImageDropZone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rend le prompt par défaut quand aucun fichier choisi', () => {
    renderZone();
    expect(screen.getByText('Glissez ou cliquez')).toBeDefined();
    expect(screen.queryByTestId('test-drop-dropzone-preview')).toBeNull();
  });

  it('rejette un type non supporté avec un message explicite', async () => {
    fakeReadAsDataURL();
    const { onLoaded, onCleared } = renderZone();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = buildFile('doc.pdf', 'application/pdf', 1024);
    Object.defineProperty(input, 'files', { value: [pdf], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(onLoaded).not.toHaveBeenCalled();
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('test-drop-file-error').textContent).toBe('Format non supporté');
  });

  it('rejette un fichier trop lourd (> 2 Mo) avec la taille dans le message', async () => {
    fakeReadAsDataURL();
    const { onLoaded, onCleared } = renderZone();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const big = buildFile('huge.png', 'image/png', 3 * 1024 * 1024);
    Object.defineProperty(input, 'files', { value: [big], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(onLoaded).not.toHaveBeenCalled();
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('test-drop-file-error').textContent).toContain('3.0 Mo');
  });

  it('accepte un PNG valide, appelle onLoaded avec la data URI, affiche miniature', async () => {
    fakeReadAsDataURL('data:image/png;base64,YYYY');
    const { onLoaded, onCleared } = renderZone();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = buildFile('avatar.png', 'image/png', 100 * 1024);
    Object.defineProperty(input, 'files', { value: [png], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith('data:image/png;base64,YYYY');
    expect(onCleared).not.toHaveBeenCalled();
    const preview = screen.getByTestId('test-drop-dropzone-preview') as HTMLImageElement;
    expect(preview.src).toBe('data:image/png;base64,YYYY');
    // Métadonnées affichées : nom du fichier + taille.
    expect(screen.getByText('avatar.png')).toBeDefined();
    expect(screen.getByText('100.0 Ko')).toBeDefined();
  });

  it('drop event déclenche le même flux que le click+select', async () => {
    fakeReadAsDataURL('data:image/jpeg;base64,ZZZZ');
    const { onLoaded } = renderZone();
    const dropzone = screen.getByTestId('test-drop-dropzone');
    const jpg = buildFile('photo.jpg', 'image/jpeg', 50 * 1024);
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [jpg] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(onLoaded).toHaveBeenCalledWith('data:image/jpeg;base64,ZZZZ');
  });

  it('le bouton Retirer reset l état et notifie onCleared', async () => {
    fakeReadAsDataURL();
    const { onCleared } = renderZone();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = buildFile('a.png', 'image/png', 1024);
    Object.defineProperty(input, 'files', { value: [png], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByText('Retirer'));
    expect(onCleared).toHaveBeenCalled();
    expect(screen.queryByTestId('test-drop-dropzone-preview')).toBeNull();
    expect(screen.getByText('Glissez ou cliquez')).toBeDefined();
  });

  it('aspect="wide" rend une miniature large plutôt que carrée', async () => {
    fakeReadAsDataURL();
    renderZone({ aspect: 'wide' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const png = buildFile('banner.png', 'image/png', 1024);
    Object.defineProperty(input, 'files', { value: [png], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
    const preview = screen.getByTestId('test-drop-dropzone-preview') as HTMLImageElement;
    // En aspect wide on s'attend à une largeur > hauteur dans la classe.
    expect(preview.className).toMatch(/w-32/);
    expect(preview.className).toMatch(/h-12/);
  });
});
