import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StickyActionBar } from '../../src/components/StickyActionBar.js';

afterEach(cleanup);

describe('StickyActionBar', () => {
  it('affiche le label clean quand dirty=false', () => {
    render(<StickyActionBar dirty={false} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('Aucune modification.')).toBeDefined();
  });

  it('affiche le label dirty quand dirty=true', () => {
    render(<StickyActionBar dirty={true} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('Modifications non sauvegardées.')).toBeDefined();
  });

  it('description override le label par défaut', () => {
    render(
      <StickyActionBar
        dirty={true}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        description="3 règles modifiées"
      />,
    );
    expect(screen.getByText('3 règles modifiées')).toBeDefined();
  });

  it('Save appelle onSave quand dirty et non pending', () => {
    const onSave = vi.fn();
    render(<StickyActionBar dirty={true} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Cancel appelle onCancel quand dirty et non pending', () => {
    const onCancel = vi.fn();
    render(<StickyActionBar dirty={true} onCancel={onCancel} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('boutons désactivés quand dirty=false', () => {
    render(<StickyActionBar dirty={false} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(
      (screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('Save montre pendingLabel et désactive quand pending=true', () => {
    render(<StickyActionBar dirty={true} pending={true} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Enregistrement…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('rend le node extra à droite avant les boutons', () => {
    render(
      <StickyActionBar
        dirty={true}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        extra={<span data-testid="err">Erreur fictive</span>}
      />,
    );
    expect(screen.getByTestId('err').textContent).toBe('Erreur fictive');
  });
});
