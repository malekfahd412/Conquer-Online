import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { setWelcomeConfig } from '../../discord/welcome/welcome-store';

export class ConfigureWelcomeTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_welcome',
    description: 'Configures the welcome message system: channel, messages (supports {user} {username} {server} {membercount}), auto-role, auto-nickname, DM welcome, image, delay.',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'string', description: '"true" or "false" to enable/disable welcome messages' },
        channel: { type: 'string', description: 'Channel name/ID to post welcome messages in' },
        messages: { type: 'string', description: 'One or more welcome messages separated by "||" (a random one is chosen each time). Variables: {user} {username} {server} {membercount}' },
        embedTitle: { type: 'string', description: 'Embed title (optional)' },
        image: { type: 'string', description: 'Image URL for the welcome embed (optional)' },
        autoRoles: { type: 'string', description: 'Comma-separated role names/IDs to auto-assign on join (optional)' },
        autoNickname: { type: 'string', description: 'Nickname template to auto-set on join, e.g. "New | {username}" (optional)' },
        dmEnabled: { type: 'string', description: '"true" or "false" to also DM the new member' },
        dmMessage: { type: 'string', description: 'DM message template (optional)' },
        delaySeconds: { type: 'number', description: 'Delay before sending the welcome message, in seconds (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Enable welcome messages in #welcome', 'Set welcome message to "Welcome {user} to {server}!"'],
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
    if (params['autoRoles']) {
      const roles = await guild.roles.fetch();
      patch.autoRoleIds = String(params['autoRoles']).split(',').map(s => s.trim()).filter(Boolean)
        .map(q => roles.find(r => r.id === q || r.name.toLowerCase() === q.toLowerCase())?.id)
        .filter((id): id is string => !!id);
    }
    if (params['autoNickname']) patch.autoNickname = String(params['autoNickname']);
    if (params['dmEnabled'] !== undefined) patch.dmEnabled = String(params['dmEnabled']).toLowerCase() === 'true';
    if (params['dmMessage']) patch.dmMessage = String(params['dmMessage']);
    if (params['delaySeconds'] !== undefined) patch.delaySeconds = Number(params['delaySeconds']);

    const cfg = await setWelcomeConfig(guild.id, patch);
    return { success: true, message: `👋 **Welcome config updated**\n• Enabled: ${cfg.enabled}\n• Channel: ${cfg.channelId ? `<#${cfg.channelId}>` : '_none_'}\n• Messages: ${cfg.messages.length}\n• Auto-roles: ${cfg.autoRoleIds.length}` };
  }
}
