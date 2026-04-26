import { describe, expect, it } from 'vitest';

import { moderation } from '../../src/index.js';

describe('moderation defineModule', () => {
  it('expose le manifeste avec id moderation', () => {
    expect(moderation.manifest.id).toBe('moderation');
  });

  it('ne déclare AUCUNE slash command en PR 4.M.1', () => {
    // Garde-fou : déclarer `commands` sans handler enregistrerait des
    // entrées dans le CommandRegistry qui resteraient sans réponse.
    expect(moderation.commands).toBeUndefined();
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
