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

export async function registerSlashCommands(
  token: string,
  clientId: string,
  guildIds: string[],
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);

  if (guildIds.length === 0) {
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: ALL_COMMANDS });
      logger.success('Registered /ai and /clear globally (may take up to 1h to appear)');
    } catch (error) {
      logger.error('Failed to register global slash commands', error);
    }
    return;
  }

  let registered = 0;
  for (const guildId of guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: ALL_COMMANDS });
      registered++;
    } catch (error) {
      logger.error(`Failed to register commands in guild ${guildId}`, error);
    }
  }

  if (registered > 0) {
    logger.success(`Registered /ai and /clear in ${registered} guild(s) — commands are instantly available`);
  }
}
