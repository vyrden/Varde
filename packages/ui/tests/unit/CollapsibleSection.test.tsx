import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CollapsibleSection } from '../../src/components/CollapsibleSection.js';

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // happy-dom : localStorage présent par défaut
  }
});

describe('CollapsibleSection', () => {
  it('rendu ferme par défaut, body hidden', () => {
    render(
      <CollapsibleSection title="Avancé">
        <p>contenu</p>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /Avancé/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('clic ouvre la section et met à jour aria-expanded', () => {
    render(
      <CollapsibleSection title="Avancé">
        <p>contenu</p>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /Avancé/ });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('defaultOpen=true ouvre au mount', () => {
    render(
      <CollapsibleSection title="Avancé" defaultOpen>
        <p>contenu</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole('button', { name: /Avancé/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('mode controlled : appelle onOpenChange et reflète prop open', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CollapsibleSection title="Avancé" open={false} onOpenChange={onOpenChange}>
        <p>contenu</p>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Avancé/ }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <CollapsibleSection title="Avancé" open={true} onOpenChange={onOpenChange}>
        <p>contenu</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole('button', { name: /Avancé/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('storageKey : initialise depuis localStorage si présent', () => {
    window.localStorage.setItem('test-key', '1');
    render(
      <CollapsibleSection title="Avancé" storageKey="test-key">
        <p>contenu</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole('button', { name: /Avancé/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('storageKey : persiste à chaque toggle', () => {
    render(
      <CollapsibleSection title="Avancé" storageKey="persist-key">
        <p>contenu</p>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /Avancé/ });
    fireEvent.click(button);
    expect(window.localStorage.getItem('persist-key')).toBe('1');
    fireEvent.click(button);
    expect(window.localStorage.getItem('persist-key')).toBe('0');
  });

  it('storageKey absent : aucune écriture localStorage', () => {
    render(
      <CollapsibleSection title="Avancé">
        <p>contenu</p>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Avancé/ }));
    // Pas de clé persistée — localStorage doit être vide.
    expect(window.localStorage.length).toBe(0);
  });

  it('forceMount=false démonte le body quand fermé', () => {
    const { container } = render(
      <CollapsibleSection title="Avancé" forceMount={false}>
        <p>contenu secret</p>
      </CollapsibleSection>,
    );
    expect(container.textContent).not.toContain('contenu secret');
  });

  it('badge est rendu dans le header', () => {
    render(
      <CollapsibleSection title="Avancé" badge={<span>3 items</span>}>
        <p>contenu</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText('3 items')).toBeDefined();
  });

  it('subtitle est rendu sous le titre', () => {
    render(
      <CollapsibleSection title="Avancé" subtitle="Pour utilisateurs avancés">
        <p>contenu</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText('Pour utilisateurs avancés')).toBeDefined();
  });
});

describe('CollapsibleSection — localStorage corrompu', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('valeur invalide → fallback sur defaultOpen', () => {
    window.localStorage.setItem('corrupt-key', 'maybe?');
    render(
      <CollapsibleSection title="Avancé" defaultOpen={true} storageKey="corrupt-key">
        <p>contenu</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole('button', { name: /Avancé/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});
