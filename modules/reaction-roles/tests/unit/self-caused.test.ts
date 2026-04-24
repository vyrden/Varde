import { describe, expect, it } from 'vitest';

import { createSelfCausedTracker, emojiKey } from '../../src/self-caused.js';

describe('SelfCausedTracker', () => {
  it('retourne true une fois après un mark, puis false (consomme la marque)', () => {
    const t = createSelfCausedTracker();
    t.mark('u1', 'm1', 'u:🎉');
    expect(t.isSelfCaused('u1', 'm1', 'u:🎉')).toBe(true);
    expect(t.isSelfCaused('u1', 'm1', 'u:🎉')).toBe(false);
  });

  it('retourne false sur une clé non marquée', () => {
    const t = createSelfCausedTracker();
    expect(t.isSelfCaused('u1', 'm1', 'u:🎉')).toBe(false);
  });

  it('purge les marques expirées (TTL 2s)', () => {
    let now = 1000;
    const t = createSelfCausedTracker(() => now);
    t.mark('u1', 'm1', 'u:🎉');
    expect(t.size()).toBe(1);
    now = 3500; // > 1000 + 2000
    expect(t.isSelfCaused('u1', 'm1', 'u:🎉')).toBe(false);
    expect(t.size()).toBe(0);
  });

  it('isole les clés par (userId, messageId, emoji)', () => {
    const t = createSelfCausedTracker();
    t.mark('u1', 'm1', 'u:🎉');
    expect(t.isSelfCaused('u2', 'm1', 'u:🎉')).toBe(false);
    expect(t.isSelfCaused('u1', 'm2', 'u:🎉')).toBe(false);
    expect(t.isSelfCaused('u1', 'm1', 'u:🌍')).toBe(false);
  });

  it('size reflète le nombre de marques actives', () => {
    const t = createSelfCausedTracker();
    expect(t.size()).toBe(0);
    t.mark('u1', 'm1', 'u:🎉');
    expect(t.size()).toBe(1);
    t.mark('u2', 'm1', 'u:🎉');
    expect(t.size()).toBe(2);
    t.isSelfCaused('u1', 'm1', 'u:🎉');
    expect(t.size()).toBe(1);
  });
});

describe('emojiKey', () => {
  it('format unicode avec préfixe u:', () => {
    expect(emojiKey({ type: 'unicode', value: '🎉' })).toBe('u:🎉');
  });

  it('format custom avec préfixe c: et id', () => {
    expect(emojiKey({ type: 'custom', id: '123' })).toBe('c:123');
  });
});
