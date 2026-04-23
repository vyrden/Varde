import { describe, expect, it } from 'vitest';

import { createUIService, isUIMessage } from '../../src/ui.js';

describe('createUIService — embed enrichi', () => {
  const ui = createUIService();

  it('accepte title seul (rétro-compat)', () => {
    const message = ui.embed({ title: 'Titre' });
    expect(message.kind).toBe('embed');
    if (message.kind !== 'embed') throw new Error('type guard');
    expect(message.payload.title).toBe('Titre');
    expect(message.payload.description).toBeUndefined();
    expect(isUIMessage(message)).toBe(true);
  });

  it('accepte la surface complète (fields, color, timestamp, author, footer)', () => {
    const message = ui.embed({
      title: 'Message supprimé',
      description: 'Détails',
      color: 0xc0392b,
      timestamp: '2026-04-23T14:32:00.000Z',
      author: { name: 'Varde' },
      footer: { text: 'Varde · 2026-04-23' },
      fields: [
        { name: 'Salon', value: '#mod-log', inline: true },
        { name: 'Auteur', value: '<@1>', inline: true },
      ],
    });
    if (message.kind !== 'embed') throw new Error('type guard');
    expect(message.payload.color).toBe(0xc0392b);
    expect(message.payload.fields).toHaveLength(2);
    expect(message.payload.author?.name).toBe('Varde');
  });

  it('attache les attachments passés en deuxième argument', () => {
    const buf = Buffer.from('hello');
    const message = ui.embed(
      { title: 'Avec pj' },
      [{ filename: 'content.txt', contentType: 'text/plain; charset=utf-8', data: buf }],
    );
    if (message.kind !== 'embed') throw new Error('type guard');
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments?.[0]?.filename).toBe('content.txt');
  });

  it('produit un UIMessage gelé (immuable)', () => {
    const message = ui.embed({ title: 'Gel' });
    expect(Object.isFrozen(message)).toBe(true);
    if (message.kind !== 'embed') throw new Error('type guard');
    expect(Object.isFrozen(message.payload)).toBe(true);
  });

  it('omet les attachments si non fournis (pas de propriété vide)', () => {
    const message = ui.embed({ title: 'Sans pj' });
    expect(message).not.toHaveProperty('attachments');
  });
});
