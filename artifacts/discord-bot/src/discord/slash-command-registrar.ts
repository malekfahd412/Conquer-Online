import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';
import { logger } from '../utils/logger';

const AI_COMMAND = {
  name: 'ai',
  description: 'Send a natural language command to the AI Control Center',
  options: [
    {
      name: 'prompt',
      type: ApplicationCommandOptionType.String,
      description: 'What would you like the AI to do? (e.g. "Create a ticket system")',
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

const WORKSPACE_COMMAND = {
  name: 'workspace',
  description: 'Manage AI workspaces — named, resumable conversation sessions',
  options: [
    {
      name: 'start',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Start a new named workspace',
      options: [
        {
          name: 'name',
          type: ApplicationCommandOptionType.String,
          description: 'Workspace name (e.g. "Ticket System", "Server Setup")',
          required: true,
        },
        {
          name: 'description',
          type: ApplicationCommandOptionType.String,
          description: 'Optional description for this workspace',
          required: false,
        },
      ],
    },
    {
      name: 'resume',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Resume a previous workspace by name',
      options: [
        {
          name: 'name',
          type: ApplicationCommandOptionType.String,
          description: 'Name of the workspace to resume',
          required: true,
        },
      ],
    },
    {
      name: 'end',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'End the current workspace (keeps it saved for later)',
    },
    {
      name: 'list',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'List all your saved workspaces',
    },
    {
      name: 'delete',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Permanently delete a workspace',
      options: [
        {
          name: 'name',
          type: ApplicationCommandOptionType.String,
          description: 'Name of the workspace to delete',
          required: true,
        },
      ],
    },
  ],
};

const VOICE_COMMAND = {
  name: 'voice',
  description: 'Control the Voice AI assistant (join, leave, status)',
  options: [
    {
      name: 'join',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Join your current voice channel and start listening',
    },
    {
      name: 'leave',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Leave the voice channel',
    },
    {
      name: 'status',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Show Voice AI status for this server',
    },
    {
      name: 'personality',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Change the voice personality',
      options: [
        {
          name: 'type',
          type: ApplicationCommandOptionType.String,
          description: 'Personality type',
          required: true,
          choices: [
            { name: 'Friendly', value: 'friendly' },
            { name: 'Professional', value: 'professional' },
            { name: 'Gaming', value: 'gaming' },
            { name: 'Funny', value: 'funny' },
            { name: 'Assistant', value: 'assistant' },
          ],
        },
      ],
    },
  ],
};

const PANEL_COMMAND = {
  name: 'panel',
  description: 'Open the Discord Control Center — browse and execute all 323 tools interactively',
};

const CC_TEST_COMMAND = {
  name: 'cc-test',
  description: '[Admin] Run a full Control Center render audit — checks every renderer for duplicate IDs',
};

const ALL_COMMANDS = [
  PANEL_COMMAND,
  CC_TEST_COMMAND,
  AI_COMMAND,
  FORGET_COMMAND,
  MEMORY_COMMAND,
  PREFERENCES_COMMAND,
  RESET_PREFS_COMMAND,
  WORKSPACE_COMMAND,
  VOICE_COMMAND,
];

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
