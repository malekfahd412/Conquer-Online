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
      // Non-privileged — no Developer Portal toggle required. Used by the
      // Discord-native Support Inbox thread interface to bridge a "typing…"
      // indicator from a staff thread reply back into the user's DM, and to
      // detect the 👀 read-receipt reaction on mirrored user messages.
      GatewayIntentBits.GuildMessageTyping,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
      // Required to receive DMs that haven't been cached yet
      Partials.Channel,
      Partials.Message,
      // Required so reaction events fire even for messages/reactions the bot hasn't cached
      Partials.Reaction,
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
