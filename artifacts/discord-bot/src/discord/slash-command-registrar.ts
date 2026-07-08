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

const FORGET_COMMAND = {
  name: 'forget',
  description: 'Clear your AI conversation memory for this server and start fresh',
};

const MEMORY_COMMAND = {
  name: 'memory',
  description: 'Show your current AI conversation memory and active context',
};

const PREFERENCES_COMMAND = {
  name: 'preferences',
  description: 'Show your stored long-term AI preferences',
};

const RESET_PREFS_COMMAND = {
  name: 'resetpreferences',
  description: 'Reset all your stored long-term AI preferences',
};

const ALL_COMMANDS = [AI_COMMAND, FORGET_COMMAND, MEMORY_COMMAND, PREFERENCES_COMMAND, RESET_PREFS_COMMAND];

const GUILD_ID = '1213437502078062674';

export async function registerSlashCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: ALL_COMMANDS });
    logger.success(`Registered ${ALL_COMMANDS.length} commands in guild ${GUILD_ID} — instantly available`);
  } catch (error) {
    logger.error(`Failed to register commands in guild ${GUILD_ID}`, error);
  }
}
