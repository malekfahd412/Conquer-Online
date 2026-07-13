import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { logger } from '../utils/logger';

export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      // Required to receive DMs that haven't been cached yet
      Partials.Channel,
      Partials.Message,
    ],
  });
}

export async function loginClient(client: Client, token: string): Promise<void> {
  logger.info('Logging into Discord...');

  await new Promise<void>((resolve, reject) => {
    client.once('clientReady', () => {
      if (client.user) {
        logger.success(`Logged in as ${client.user.tag}`);
      }
      resolve();
    });

    client.once('error', reject);

    client.login(token).catch(reject);
  });
}
