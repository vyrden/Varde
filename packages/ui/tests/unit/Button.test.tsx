import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/components/Button.js';

describe('Button', () => {
  it('rend un bouton avec son contenu', () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDefined();
  });

  it('applique la variante demandée via classes Tailwind', () => {
    render(<Button variant="destructive">Supprimer</Button>);
    const btn = screen.getByRole('button', { name: 'Supprimer' });
    expect(btn.className).toContain('bg-destructive');
  });

  it('type par défaut à "button" (évite les submits accidentels)', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button', { name: 'x' }).getAttribute('type')).toBe('button');
  });

  it('transmet onClick au DOM', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Clic</Button>);
    screen.getByRole('button', { name: 'Clic' }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('accepte une classe supplémentaire via className', () => {
    render(<Button className="custom-extra">ok</Button>);
    expect(screen.getByRole('button', { name: 'ok' }).className).toContain('custom-extra');
  });
});
