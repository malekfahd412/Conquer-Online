import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from '../utils/logger';

export function createDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds],
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
