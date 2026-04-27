import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TemplatePicker } from '../../../components/reaction-roles/TemplatePicker';

afterEach(cleanup);

describe('TemplatePicker', () => {
  it('affiche 6 cards', () => {
    render(<TemplatePicker onPick={vi.fn()} onCancel={vi.fn()} />);
    const cards = screen.getAllByRole('button', { name: /Choisir le modèle/i });
    expect(cards).toHaveLength(6);
  });

  it('inclut les 6 labels attendus', () => {
    render(<TemplatePicker onPick={vi.fn()} onCancel={vi.fn()} />);
    for (const label of [
      'Commencer à partir de zéro',
      'Vérifier',
      'Notifications',
      'Couleurs',
      'Continents',
      'Zodiaque',
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('clic sur une card appelle onPick avec le template correspondant', () => {
    const onPick = vi.fn();
    render(<TemplatePicker onPick={onPick} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Choisir le modèle Continents/i }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'continents' }));
  });

  it('clic Retour appelle onCancel', () => {
    const onCancel = vi.fn();
    render(<TemplatePicker onPick={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /Retour/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
