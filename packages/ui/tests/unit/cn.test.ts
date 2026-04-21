import { describe, expect, it } from 'vitest';

import { cn } from '../../src/lib/cn.js';

describe('cn', () => {
  it('concatène des classes simples', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filtre les valeurs falsy', () => {
    expect(cn('foo', false, null, undefined, '', 'bar')).toBe('foo bar');
  });

  it('applique les conditions via l objet', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('arbitre les classes Tailwind qui s opposent (tailwind-merge)', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });
});
