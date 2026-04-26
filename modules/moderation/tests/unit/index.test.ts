import { describe, expect, it } from 'vitest';

import { moderation } from '../../src/index.js';

describe('moderation defineModule', () => {
  it('expose le manifeste avec id moderation', () => {
    expect(moderation.manifest.id).toBe('moderation');
  });

  it('déclare 10 slash commands en PR 4.M.2b', () => {
    expect(moderation.commands).toBeDefined();
    const names = Object.keys(moderation.commands ?? {}).sort();
    expect(names).toEqual([
      'ban',
      'clear',
      'kick',
      'mute',
      'slowmode',
      'tempban',
      'tempmute',
      'unban',
      'unmute',
      'warn',
    ]);
  });

  it('expose lifecycle onLoad et onUnload', () => {
    expect(typeof moderation.onLoad).toBe('function');
    expect(typeof moderation.onUnload).toBe('function');
  });

  it('expose configSchema et configUi', () => {
    expect(moderation.configSchema).toBeDefined();
    expect(moderation.configUi).toEqual({ fields: [] });
  });
});
