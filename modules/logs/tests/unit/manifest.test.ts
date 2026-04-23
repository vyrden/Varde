import { parseManifestStatic, validateEmitPrefix } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { manifest } from '../../src/manifest.js';

describe('manifest logs', () => {
  it('passe la validation Zod du meta-schema', () => {
    expect(() => parseManifestStatic(manifest)).not.toThrow();
  });

  it("ne déclare qu'une seule permission namespace logs.*", () => {
    expect(manifest.permissions).toHaveLength(1);
    expect(manifest.permissions[0]?.id).toBe('logs.config.manage');
  });

  it("écoute les 12 events guild.* pertinents et n'en émet aucun", () => {
    // Liste exhaustive des events couverts — toute modification doit être
    // reflétée ici (documentation vivante de la couverture du module logs).
    const expectedEvents = [
      'guild.memberJoin',
      'guild.memberLeave',
      'guild.memberUpdate',
      'guild.messageCreate',
      'guild.messageDelete',
      'guild.messageEdit',
      'guild.channelCreate',
      'guild.channelUpdate',
      'guild.channelDelete',
      'guild.roleCreate',
      'guild.roleUpdate',
      'guild.roleDelete',
    ];
    expect(manifest.events.listen).toHaveLength(expectedEvents.length);
    expect(manifest.events.listen).toEqual(expect.arrayContaining(expectedEvents));
    expect(manifest.events.emit).toEqual([]);
  });

  it('emit est préfixé correctement (trivially — vide)', () => {
    const result = validateEmitPrefix(manifest);
    expect(result).toEqual({ valid: true });
  });
});
