import { describe, expect, it } from 'vitest';

import { manifest } from '../../src/manifest.js';

describe('manifest moderation', () => {
  it('id = moderation, version 1.1.0', () => {
    expect(manifest.id).toBe('moderation');
    expect(manifest.version).toBe('1.1.0');
  });

  it('déclare 8 permissions granulaires (6 actions + cases.read + automod.manage)', () => {
    expect(manifest.permissions).toHaveLength(8);
    const ids = manifest.permissions.map((p) => p.id);
    expect(ids).toEqual([
      'moderation.actions.warn',
      'moderation.actions.kick',
      'moderation.actions.ban',
      'moderation.actions.mute',
      'moderation.actions.purge',
      'moderation.actions.slowmode',
      'moderation.cases.read',
      'moderation.automod.manage',
    ]);
  });

  it("toutes les permissions sont en defaultLevel='admin'", () => {
    for (const perm of manifest.permissions) {
      expect(perm.defaultLevel).toBe('admin');
    }
  });

  it("range cases.read sous category='audit', les actions sous 'moderation', automod.manage sous 'config'", () => {
    const byId = new Map(manifest.permissions.map((p) => [p.id, p]));
    expect(byId.get('moderation.cases.read')?.category).toBe('audit');
    expect(byId.get('moderation.actions.warn')?.category).toBe('moderation');
    expect(byId.get('moderation.actions.ban')?.category).toBe('moderation');
    expect(byId.get('moderation.automod.manage')?.category).toBe('config');
  });

  it("écoute guild.messageCreate (automod) et n'émet aucun event", () => {
    expect(manifest.events.listen).toEqual(['guild.messageCreate']);
    expect(manifest.events.emit).toEqual([]);
  });
});
