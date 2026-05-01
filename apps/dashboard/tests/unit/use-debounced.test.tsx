import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebounced } from '../../lib/use-debounced';

describe('useDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renvoie la valeur initiale sans attendre', () => {
    const { result } = renderHook(() => useDebounced('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('met à jour la valeur après le délai', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 500), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('reset du timer à chaque changement (debounce)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 500), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // 300 + 300 = 600 ms total mais le 2e changement a reset le timer
    // → la valeur devrait toujours être 'a'.
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Maintenant 500 ms se sont écoulés depuis le 2e changement.
    expect(result.current).toBe('c');
  });

  it('respecte le delay passé en argument', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounced(value, delay), {
      initialProps: { value: 'a', delay: 100 },
    });
    rerender({ value: 'b', delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('b');
  });

  it('cleanup le timer au unmount', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebounced(value, 500), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    unmount();
    // Si cleanup absent, advancement ferait setState après unmount → warning.
    // On vérifie juste que ça n'explose pas.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
  });
});
