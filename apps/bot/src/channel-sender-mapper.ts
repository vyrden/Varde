import type { ChannelId, UIEmbed, UIMessage } from '@varde/contracts';
import { AttachmentBuilder, type Client, EmbedBuilder } from 'discord.js';

import type { ChannelSender } from './discord-service.js';

/**
 * Traduit un `UIMessage` de kind `'embed'` en payload
 * `channel.send(...)` de discord.js v14. Isolé dans son propre
 * module pour être testable sans Client discord.js.
 */
export interface DiscordJsSendPayload {
  readonly embeds: readonly EmbedBuilder[];
  readonly files?: readonly AttachmentBuilder[];
}

const applyEmbed = (embed: EmbedBuilder, source: UIEmbed): EmbedBuilder => {
  if (source.title !== undefined) embed.setTitle(source.title);
  if (source.description !== undefined) embed.setDescription(source.description);
  if (source.url !== undefined) embed.setURL(source.url);
  if (source.color !== undefined) embed.setColor(source.color);
  if (source.timestamp !== undefined) embed.setTimestamp(new Date(source.timestamp));
  if (source.author !== undefined) {
    embed.setAuthor({
      name: source.author.name,
      ...(source.author.iconUrl !== undefined ? { iconURL: source.author.iconUrl } : {}),
      ...(source.author.url !== undefined ? { url: source.author.url } : {}),
    });
  }
  if (source.footer !== undefined) {
    embed.setFooter({
      text: source.footer.text,
      ...(source.footer.iconUrl !== undefined ? { iconURL: source.footer.iconUrl } : {}),
    });
  }
  if (source.fields !== undefined && source.fields.length > 0) {
    embed.addFields(
      source.fields.map((f) => ({
        name: f.name,
        value: f.value,
        ...(f.inline !== undefined ? { inline: f.inline } : {}),
      })),
    );
  }
  if (source.thumbnailUrl !== undefined) embed.setThumbnail(source.thumbnailUrl);
  if (source.imageUrl !== undefined) embed.setImage(source.imageUrl);
  return embed;
};

/**
 * Construit un `ChannelSender` de production à partir d'un Client
 * discord.js. `sendMessage` envoie du texte brut ; `sendEmbed` passe
 * par `mapEmbedToDiscordJsPayload` pour produire le payload v14.
 */
export function createDiscordJsChannelSender(client: Client): ChannelSender {
  return {
    async sendMessage(channelId: ChannelId, content: string): Promise<void> {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !('send' in channel)) {
        throw new Error('Unknown Channel');
      }
      await channel.send({ content });
    },

    async sendEmbed(channelId: ChannelId, message: UIMessage): Promise<void> {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !('send' in channel)) {
        throw new Error('Unknown Channel');
      }
      const payload = mapEmbedToDiscordJsPayload(message);
      await channel.send({
        embeds: payload.embeds as never, // cast readonly → mutable accepté par discord.js
        ...(payload.files !== undefined ? { files: payload.files as never } : {}),
      });
    },
  };
}

/**
 * Convertit un `UIMessage` de kind `'embed'` en payload prêt pour
 * `channel.send(...)` de discord.js v14.
 *
 * @throws {TypeError} Si le `UIMessage` n'est pas de kind `'embed'`.
 */
export function mapEmbedToDiscordJsPayload(message: UIMessage): DiscordJsSendPayload {
  if (message.kind !== 'embed') {
    throw new TypeError(
      `mapEmbedToDiscordJsPayload : UIMessage attendu de kind='embed', reçu '${message.kind}'.`,
    );
  }
  const embed = applyEmbed(new EmbedBuilder(), message.payload);
  const payload: { embeds: EmbedBuilder[]; files?: AttachmentBuilder[] } = { embeds: [embed] };
  if (message.attachments !== undefined && message.attachments.length > 0) {
    payload.files = message.attachments.map(
      (a) => new AttachmentBuilder(a.data, { name: a.filename }),
    );
  }
  return payload;
}
