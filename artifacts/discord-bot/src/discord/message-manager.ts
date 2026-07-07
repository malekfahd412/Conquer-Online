import {
  type Client,
  type TextChannel,
  type Message,
  type APIEmbed,
  type ActionRowBuilder,
  type ButtonBuilder,
  ChannelType,
} from 'discord.js';
import { logger } from '../utils/logger';

type ButtonRow = ActionRowBuilder<ButtonBuilder>;

export class MessageManager {
  private message: Message | null = null;
  private channel: TextChannel | null = null;

  constructor(private readonly client: Client, private readonly channelId: string) {}

  async initialize(): Promise<void> {
    logger.info(`Locating status channel ${this.channelId}...`);

    const fetchedChannel = await this.client.channels.fetch(this.channelId);

    if (!fetchedChannel || fetchedChannel.type !== ChannelType.GuildText) {
      throw new Error(
        `Channel ${this.channelId} not found or is not a text channel.\n` +
        `Make sure:\n` +
        `  1. The bot has access to the channel.\n` +
        `  2. CHANNEL_SERVER_STATUS is set to the correct channel ID.\n` +
        `  3. The bot has "Read Messages" and "Send Messages" permissions.`,
      );
    }

    this.channel = fetchedChannel as TextChannel;
    logger.success(`Status channel found: #${this.channel.name}`);

    this.message = await this.findExistingMessage();

    if (this.message) {
      logger.success(`Reusing existing status message (ID: ${this.message.id})`);
    } else {
      logger.info('No existing status message found — a new one will be created on first update');
    }
  }

  async updateEmbed(embed: APIEmbed, components: ButtonRow[]): Promise<void> {
    if (!this.channel) {
      throw new Error('MessageManager is not initialized — call initialize() first');
    }

    const payload = {
      embeds: [embed],
      components,
    };

    if (this.message) {
      try {
        await this.message.edit(payload);
        logger.info('Status message updated');
        return;
      } catch (error) {
        logger.warning('Failed to edit existing message — recreating', error);
        this.message = null;
      }
    }

    this.message = await this.channel.send(payload);
    logger.success(`Status message created (ID: ${this.message.id})`);
  }

  private async findExistingMessage(): Promise<Message | null> {
    if (!this.channel) return null;

    try {
      const messages = await this.channel.messages.fetch({ limit: 20 });

      const botUser = this.client.user;
      if (!botUser) return null;

      const botMessage = messages.find(
        m => m.author.id === botUser.id && m.embeds.length > 0,
      );

      return botMessage ?? null;
    } catch (error) {
      logger.warning('Could not search for existing status message', error);
      return null;
    }
  }
}
