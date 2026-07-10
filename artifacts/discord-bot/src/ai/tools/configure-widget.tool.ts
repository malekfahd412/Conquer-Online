import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ConfigureWidgetTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_widget',
    description: 'Enables or disables the server widget, and optionally sets which channel the widget invite links to.',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'string', enum: ['true', 'false'], description: 'Enable or disable the server widget' },
        channel: { type: 'string', description: 'Channel name the widget invite points to (optional)' },
      },
      required: ['enabled'],
    },
    dangerous: false,
    examples: ['Enable widget pointing to #general', 'Disable the server widget'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const enabled = params['enabled'] === 'true';
    let channelId: string | null = null;

    if (params['channel']) {
      const channelName = String(params['channel']).trim().toLowerCase();
      const ch = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name.toLowerCase() === channelName,
      );
      if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };
      channelId = ch.id;
    }

    await guild.setWidgetSettings({ enabled, channel: channelId });
    const channelPart = channelId ? ` → pointing to <#${channelId}>` : '';
    return {
      success: true,
      message: `Server widget ${enabled ? 'enabled' : 'disabled'}${channelPart}`,
    };
  }
}
