import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton, SkeletonCard, SkeletonText } from '../../src/components/Skeleton.js';

describe('Skeleton', () => {
  it("rend un span avec animate-pulse et aria-hidden='true' (legacy)", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const node = container.querySelector('span');
    expect(node).not.toBeNull();
    expect(node?.getAttribute('aria-hidden')).toBe('true');
    expect(node?.className).toContain('animate-pulse');
    expect(node?.className).toContain('h-4');
  });
});

describe('SkeletonText', () => {
  it("rend N lignes par défaut (3) quand `lines` n'est pas passé", () => {
    const { container } = render(<SkeletonText />);
    const lines = container.querySelectorAll('span');
    // SkeletonText rend une span par ligne.
    expect(lines.length).toBe(3);
  });

  it('rend exactement le nombre de lignes demandé', () => {
    const { container } = render(<SkeletonText lines={5} />);
    const lines = container.querySelectorAll('span');
    expect(lines.length).toBe(5);
  });

  it('chaque ligne a animate-pulse et aria-hidden', () => {
    const { container } = render(<SkeletonText lines={2} />);
    const lines = container.querySelectorAll('span');
    for (const line of Array.from(lines)) {
      expect(line.className).toContain('animate-pulse');
      expect(line.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('la dernière ligne a une largeur réduite (effet visuel paragraphe)', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll('span');
    const last = lines[lines.length - 1];
    expect(last?.className).toContain('w-2/3');
  });

  it('rend rien quand lines = 0', () => {
    const { container } = render(<SkeletonText lines={0} />);
    expect(container.querySelectorAll('span').length).toBe(0);
  });
});

describe('SkeletonCard', () => {
  it('rend une card avec une zone de header (titre + meta) et un corps texte', () => {
    const { container } = render(<SkeletonCard />);
    // Card a au moins 4 spans skeleton (titre, meta, 3 lignes texte).
    const skeletons = container.querySelectorAll('span');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('est marqué aria-hidden au niveau racine pour ne pas polluer le screen reader', () => {
    const { container } = render(<SkeletonCard />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-hidden')).toBe('true');
  });
});
