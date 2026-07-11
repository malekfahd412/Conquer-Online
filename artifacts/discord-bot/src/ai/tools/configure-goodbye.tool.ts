import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { setGoodbyeConfig } from '../../discord/welcome/welcome-store';

export class ConfigureGoodbyeTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_goodbye',
    description: 'Configures the goodbye message system: channel, messages (supports {user} {username} {server} {membercount}), image, DM goodbye.',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'string', description: '"true" or "false" to enable/disable goodbye messages' },
        channel: { type: 'string', description: 'Channel name/ID to post goodbye messages in' },
        messages: { type: 'string', description: 'One or more goodbye messages separated by "||". Variables: {user} {username} {server} {membercount}' },
        embedTitle: { type: 'string', description: 'Embed title (optional)' },
        image: { type: 'string', description: 'Image URL for the goodbye embed (optional)' },
        dmEnabled: { type: 'string', description: '"true" or "false" to DM the leaving member (only works if a DM channel already existed)' },
        dmMessage: { type: 'string', description: 'DM message template (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Enable goodbye messages in #goodbye', 'Set goodbye message to "{username} has left {server}"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const patch: Record<string, unknown> = {};

    if (params['enabled'] !== undefined) patch.enabled = String(params['enabled']).toLowerCase() === 'true';
    if (params['channel']) {
      const channels = await guild.channels.fetch();
      const q = String(params['channel']).toLowerCase();
      const channel = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q));
      if (!channel) return { success: false, message: `Channel "${params['channel']}" not found` };
      patch.channelId = channel.id;
    }
    if (params['messages']) patch.messages = String(params['messages']).split('||').map(s => s.trim()).filter(Boolean);
    if (params['embedTitle']) patch.embedTitle = String(params['embedTitle']);
    if (params['image']) patch.image = String(params['image']);
    if (params['dmEnabled'] !== undefined) patch.dmEnabled = String(params['dmEnabled']).toLowerCase() === 'true';
    if (params['dmMessage']) patch.dmMessage = String(params['dmMessage']);

    const cfg = await setGoodbyeConfig(guild.id, patch);
    return { success: true, message: `👋 **Goodbye config updated**\n• Enabled: ${cfg.enabled}\n• Channel: ${cfg.channelId ? `<#${cfg.channelId}>` : '_none_'}\n• Messages: ${cfg.messages.length}` };
  }
}
