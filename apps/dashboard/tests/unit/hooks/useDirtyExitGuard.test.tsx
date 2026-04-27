import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type DirtyExitGuard, useDirtyExitGuard } from '../../../lib/hooks/useDirtyExitGuard';

afterEach(cleanup);

const Harness = ({
  dirty,
  onReady,
  promptMessage,
}: {
  dirty: boolean;
  onReady: (guard: DirtyExitGuard) => void;
  promptMessage?: string;
}): ReactElement => {
  const guard = useDirtyExitGuard(dirty, {
    ...(promptMessage !== undefined ? { promptMessage } : {}),
  });
  onReady(guard);
  return <div />;
};

describe('useDirtyExitGuard — beforeunload', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('ne pose PAS de listener quand dirty=false', () => {
    render(<Harness dirty={false} onReady={() => {}} />);
    const beforeUnloadAdds = addSpy.mock.calls.filter(
      ([type]: [string, unknown]) => type === 'beforeunload',
    );
    expect(beforeUnloadAdds).toHaveLength(0);
  });

  it('pose un listener beforeunload quand dirty=true', () => {
    render(<Harness dirty={true} onReady={() => {}} />);
    const beforeUnloadAdds = addSpy.mock.calls.filter(
      ([type]: [string, unknown]) => type === 'beforeunload',
    );
    expect(beforeUnloadAdds).toHaveLength(1);
  });

  it('retire le listener quand dirty repasse à false', () => {
    const { rerender } = render(<Harness dirty={true} onReady={() => {}} />);
    rerender(<Harness dirty={false} onReady={() => {}} />);
    const beforeUnloadRemoves = removeSpy.mock.calls.filter(
      ([type]: [string, unknown]) => type === 'beforeunload',
    );
    expect(beforeUnloadRemoves.length).toBeGreaterThanOrEqual(1);
  });

  it('retire le listener au démontage', () => {
    const { unmount } = render(<Harness dirty={true} onReady={() => {}} />);
    unmount();
    const beforeUnloadRemoves = removeSpy.mock.calls.filter(
      ([type]: [string, unknown]) => type === 'beforeunload',
    );
    expect(beforeUnloadRemoves.length).toBeGreaterThanOrEqual(1);
  });
});

describe('useDirtyExitGuard — confirmIfDirty', () => {
  it("exécute l'action immédiatement quand dirty=false", () => {
    let guardRef: DirtyExitGuard | null = null;
    render(
      <Harness
        dirty={false}
        onReady={(g) => {
          guardRef = g;
        }}
      />,
    );
    const action = vi.fn();
    let result: boolean | null | undefined = null;
    act(() => {
      result = guardRef?.confirmIfDirty(action);
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('demande confirmation quand dirty=true et exécute si confirmé', () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    (window as unknown as { confirm: typeof window.confirm }).confirm = confirmSpy;
    let guardRef: DirtyExitGuard | null = null;
    render(
      <Harness
        dirty={true}
        onReady={(g) => {
          guardRef = g;
        }}
      />,
    );
    const action = vi.fn();
    let result: boolean | null | undefined = null;
    act(() => {
      result = guardRef?.confirmIfDirty(action);
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it("n'exécute PAS l'action quand dirty=true et utilisateur annule", () => {
    const confirmSpy = vi.fn().mockReturnValue(false);
    (window as unknown as { confirm: typeof window.confirm }).confirm = confirmSpy;
    let guardRef: DirtyExitGuard | null = null;
    render(
      <Harness
        dirty={true}
        onReady={(g) => {
          guardRef = g;
        }}
      />,
    );
    const action = vi.fn();
    let result: boolean | null | undefined = null;
    act(() => {
      result = guardRef?.confirmIfDirty(action);
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('utilise le promptMessage custom passé en option', () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    (window as unknown as { confirm: typeof window.confirm }).confirm = confirmSpy;
    let guardRef: DirtyExitGuard | null = null;
    render(
      <Harness
        dirty={true}
        promptMessage="Vraiment quitter ?"
        onReady={(g) => {
          guardRef = g;
        }}
      />,
    );
    act(() => {
      guardRef?.confirmIfDirty(() => {});
    });
    expect(confirmSpy).toHaveBeenCalledWith('Vraiment quitter ?');
    confirmSpy.mockRestore();
  });
});
