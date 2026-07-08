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

const CLEAR_COMMAND = {
  name: 'clear',
  description: 'Clear the AI conversation history for this channel',
};

const ALL_COMMANDS = [AI_COMMAND, CLEAR_COMMAND];

const GUILD_ID = '1213437502078062674';

export async function registerSlashCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: ALL_COMMANDS });
    logger.success(`Registered /ai and /clear in guild ${GUILD_ID} — commands are instantly available`);
  } catch (error) {
    logger.error(`Failed to register commands in guild ${GUILD_ID}`, error);
  }
}
