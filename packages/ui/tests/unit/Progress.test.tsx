import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Progress } from '../../src/components/Progress.js';

describe('Progress', () => {
  afterEach(() => cleanup());

  it('expose role="progressbar" et les attributs ARIA', () => {
    const { container } = render(<Progress value={40} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('40');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
  });

  it('respecte un max custom', () => {
    const { container } = render(<Progress value={3} max={5} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('3');
    expect(bar?.getAttribute('aria-valuemax')).toBe('5');
  });

  it('clampe value hors bornes', () => {
    const { container } = render(<Progress value={150} />);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '100',
    );
  });

  it('accepte un label accessible', () => {
    const { container } = render(<Progress value={10} label="chargement du fichier" />);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      'chargement du fichier',
    );
  });

  it('applique la largeur en pourcentage au fill', () => {
    const { container } = render(<Progress value={25} />);
    const fill = container.querySelector('[role="progressbar"] > div');
    expect((fill as HTMLElement).style.width).toBe('25%');
  });
});
