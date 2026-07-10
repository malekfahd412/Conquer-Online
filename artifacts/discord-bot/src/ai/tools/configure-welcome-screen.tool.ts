import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ConfigureWelcomeScreenTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_welcome_screen',
    description: 'Enables or disables the server welcome screen and sets its description. Community servers only.',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'string', enum: ['true', 'false'], description: 'Enable or disable the welcome screen' },
        description: { type: 'string', description: 'Welcome screen description shown to new members (optional)' },
      },
      required: ['enabled'],
    },
    dangerous: false,
    examples: ['Enable welcome screen with description "Welcome to Mufasa Conquer!"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const enabled = params['enabled'] === 'true';
    const description = params['description'] ? String(params['description']).trim() : undefined;

    try {
      await guild.editWelcomeScreen({
        enabled,
        description: description ?? undefined,
        welcomeChannels: [],
      });
      return {
        success: true,
        message: `Welcome screen ${enabled ? 'enabled' : 'disabled'}${description ? ` with description: "${description}"` : ''}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing Permissions') || msg.includes('Community')) {
        return { success: false, message: 'Welcome screen can only be configured on Community servers. Enable Community first.' };
      }
      return { success: false, message: `Failed to configure welcome screen: ${msg}` };
    }
  }
}
