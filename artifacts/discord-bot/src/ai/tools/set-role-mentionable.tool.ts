import type { Guild, Role } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetRoleMentionableTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_role_mentionable',
    description: 'Sets whether everyone can @mention a role.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the role' },
        mentionable: { type: 'string', enum: ['true', 'false'], description: 'Allow @mention (true) or not (false)' },
      },
      required: ['name', 'mentionable'],
    },
    dangerous: false,
    examples: ['Make the Events role mentionable', 'Prevent @everyone from mentioning Staff'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name) as Role | undefined;
    if (!role) return { success: false, message: `Role "${params['name']}" not found` };

    const mentionable = params['mentionable'] === 'true';
    await role.setMentionable(mentionable);

    return {
      success: true,
      message: `**@${role.name}** is now ${mentionable ? '✅ mentionable by everyone' : '🔒 not mentionable by regular members'}`,
    };
  }
}
