import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';
import { logger } from '../utils/logger';

const AI_COMMAND = {
  name: 'ai',
  description: 'Send a natural language command to the AI server administrator',
  options: [
    {
      name: 'prompt',
      type: ApplicationCommandOptionType.String,
      description: 'What would you like the AI to do? (e.g. "lock the trading channel")',
      required: true,
      min_length: 1,
      max_length: 1000,
    },
  ],
};

export async function registerSlashCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(Routes.applicationCommands(clientId), { body: [AI_COMMAND] });
    logger.success('Registered /ai slash command globally (may take up to 1h to appear in new servers)');
  } catch (error) {
    logger.error('Failed to register slash commands', error);
  }
}
