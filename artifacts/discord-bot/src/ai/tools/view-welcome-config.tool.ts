import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getWelcomeConfig, getGoodbyeConfig } from '../../discord/welcome/welcome-store';

export class ViewWelcomeConfigTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'view_welcome_config',
    description: 'Shows the current welcome and goodbye configuration for this server.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show welcome config', 'View welcome and goodbye settings'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const [welcome, goodbye] = await Promise.all([getWelcomeConfig(guild.id), getGoodbyeConfig(guild.id)]);
    return {
      success: true,
      message: [
        `👋 **Welcome**: ${welcome.enabled ? '✅ enabled' : '❌ disabled'} — channel: ${welcome.channelId ? `<#${welcome.channelId}>` : '_none_'} — messages: ${welcome.messages.length} — auto-roles: ${welcome.autoRoleIds.length} — DM: ${welcome.dmEnabled}`,
        `👋 **Goodbye**: ${goodbye.enabled ? '✅ enabled' : '❌ disabled'} — channel: ${goodbye.channelId ? `<#${goodbye.channelId}>` : '_none_'} — messages: ${goodbye.messages.length} — DM: ${goodbye.dmEnabled}`,
      ].join('\n'),
    };
  }
}
