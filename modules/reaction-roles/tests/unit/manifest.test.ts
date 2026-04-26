import { describe, expect, it } from 'vitest';

import { manifest } from '../../src/manifest.js';

describe('manifest', () => {
  it('id = reaction-roles, version 1.1.0', () => {
    expect(manifest.id).toBe('reaction-roles');
    expect(manifest.version).toBe('1.1.0');
  });

  it('déclare la permission reaction-roles.config.manage', () => {
    expect(manifest.permissions).toHaveLength(1);
    expect(manifest.permissions[0]?.id).toBe('reaction-roles.config.manage');
    expect(manifest.permissions[0]?.defaultLevel).toBe('admin');
  });

  it('écoute messageReactionAdd + Remove et n émet aucun event', () => {
    expect(manifest.events.listen).toEqual([
      'guild.messageReactionAdd',
      'guild.messageReactionRemove',
    ]);
    expect(manifest.events.emit).toEqual([]);
  });
});
