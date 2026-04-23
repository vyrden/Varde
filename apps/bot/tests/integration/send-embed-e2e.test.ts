import type { ChannelId, Logger, UIMessage } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { type ChannelSender, createDiscordService } from '../../src/discord-service.js';

// Logger muet pour les tests d'intégration.
const makeLogger = (): Logger => ({
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => makeLogger(),
});

describe('sendEmbed — intégration bout en bout', () => {
  // Test 1 : UIMessage construit à la main, propagé sans altération jusqu'au sender.
  it('traverse la chaîne : UIMessage → DiscordService.sendEmbed → ChannelSender.sendEmbed', async () => {
    const senderEmbed = vi.fn<[ChannelId, UIMessage], Promise<void>>().mockResolvedValue(undefined);
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed: senderEmbed,
    };
    const discord = createDiscordService({ sender, logger: makeLogger() });

    const embed: UIMessage = {
      kind: 'embed',
      payload: {
        title: 'Test',
        description: 'Desc',
        color: 0x2ecc71,
        fields: [{ name: 'k', value: 'v' }],
      },
    };

    await discord.sendEmbed('123' as ChannelId, embed);

    expect(senderEmbed).toHaveBeenCalledTimes(1);
    const firstCall = senderEmbed.mock.calls[0];
    if (!firstCall) throw new Error('senderEmbed non appelé');
    const [forwardedChannelId, forwardedMessage] = firstCall;
    expect(forwardedChannelId).toBe('123');
    expect(forwardedMessage).toEqual(expect.objectContaining({ kind: 'embed' }));
    expect((forwardedMessage as UIMessage).payload).toEqual(
      expect.objectContaining({ title: 'Test', color: 0x2ecc71 }),
    );
  });

  // Test 2 : createUIService produit un UIMessage figé que DiscordService accepte et
  // transmet intact au sender — vérification du contrat UI factory ↔ discord layer.
  it('intégration avec ctx : ctx.ui.embed produit un UIMessage que ctx.discord.sendEmbed accepte', async () => {
    const senderEmbed = vi.fn().mockResolvedValue(undefined);
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed: senderEmbed,
    };
    const discord = createDiscordService({ sender, logger: makeLogger() });

    // On importe createUIService sans monter un ctx complet : pas de DB ni
    // d'event bus requis pour exercer le contrat de sérialisation.
    const { createUIService } = await import('@varde/core');
    const ui = createUIService();

    const embed = ui.embed({
      title: 'Via factory',
      description: 'ok',
      fields: [{ name: 'f', value: 'v' }],
    });

    await discord.sendEmbed('456' as ChannelId, embed);

    expect(senderEmbed).toHaveBeenCalledTimes(1);
    const forwarded = senderEmbed.mock.calls[0]?.[1] as UIMessage;
    expect(forwarded).toEqual(expect.objectContaining({ kind: 'embed' }));
    // Le freeze appliqué par createUIService doit survivre intègre jusqu'au sender.
    expect(Object.isFrozen(forwarded)).toBe(true);
    expect(Object.isFrozen((forwarded as Extract<UIMessage, { kind: 'embed' }>).payload)).toBe(
      true,
    );
  });
});
