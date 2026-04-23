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

  it("écoute les 4 events pilotes et n'en émet aucun", () => {
    expect(manifest.events.listen).toEqual(
      expect.arrayContaining([
        'guild.memberJoin',
        'guild.memberLeave',
        'guild.messageDelete',
        'guild.messageEdit',
      ]),
    );
    expect(manifest.events.emit).toEqual([]);
  });

  it('emit est préfixé correctement (trivially — vide)', () => {
    const result = validateEmitPrefix(manifest);
    expect(result).toEqual({ valid: true });
  });
});
