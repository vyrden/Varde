import type { GuildMessageCreateEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { formatMessageCreate } from '../../../src/formatters/message-create.js';

const mockT = (key: string, params?: Record<string, string | number>): string => {
  if (!params) return key;
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const baseEvent: GuildMessageCreateEvent = {
  type: 'guild.messageCreate',
  guildId: 'g1' as never,
  channelId: 'c1' as never,
  messageId: 'm1' as never,
  authorId: 'u1' as never,
  content: 'Bonjour',
  createdAt: Date.UTC(2026, 3, 23, 14, 32, 0),
};

describe('formatMessageCreate', () => {
  it('produit un embed gris (event bruyant) avec titre et description', () => {
    const result = formatMessageCreate(baseEvent, { t: mockT, verbosity: 'compact' });
    expect(result.embed.color).toBe(0x95a5a6);
    expect(result.embed.title).toBe('messageCreate.title');
    expect(result.embed.description).toBe('messageCreate.description');
  });

  it('mode compact ne rend aucun field (auteur + salon déjà dans description)', () => {
    const result = formatMessageCreate(baseEvent, { t: mockT, verbosity: 'compact' });
    expect(result.embed.fields ?? []).toHaveLength(0);
    expect(result.attachments).toHaveLength(0);
  });

  it('mode détaillé ajoute un field "content" avec le contenu court', () => {
    const result = formatMessageCreate(baseEvent, { t: mockT, verbosity: 'detailed' });
    const fields = result.embed.fields ?? [];
    const contentField = fields.find((f) => f.name === 'messageCreate.content');
    expect(contentField).toBeDefined();
    expect(contentField?.value).toBe('Bonjour');
    expect(result.attachments).toHaveLength(0);
  });

  it('mode détaillé bascule le contenu long (> 1024 chars) en pièce jointe .txt', () => {
    const longContent = 'a'.repeat(1500);
    const event: GuildMessageCreateEvent = { ...baseEvent, content: longContent };
    const result = formatMessageCreate(event, { t: mockT, verbosity: 'detailed' });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.contentType).toContain('text/plain');
    // le field placeholder est présent dans les fields
    const fields = result.embed.fields ?? [];
    expect(fields.find((f) => f.name === 'messageCreate.content')).toBeDefined();
  });

  it('mode détaillé ignore un contenu vide', () => {
    const event: GuildMessageCreateEvent = { ...baseEvent, content: '' };
    const result = formatMessageCreate(event, { t: mockT, verbosity: 'detailed' });
    // Pas de field content si contenu vide, pour éviter un embed avec champ vide.
    const fields = result.embed.fields ?? [];
    expect(fields.find((f) => f.name === 'messageCreate.content')).toBeUndefined();
  });
});
