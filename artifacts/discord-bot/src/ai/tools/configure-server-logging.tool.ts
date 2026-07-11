import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { setLogConfig } from '../../discord/logging/log-store';

export class ConfigureServerLoggingTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_server_logging',
    description: 'Configures server event logging: log channel and which events to log (message deletes/edits, member join/leave, voice join/leave).',
    parameters: {
      type: 'object',
      properties: {
        logChannel: { type: 'string', description: 'Channel name/ID where log events are posted' },
        logMessageDelete: { type: 'string', description: '"true" or "false"' },
        logMessageEdit: { type: 'string', description: '"true" or "false"' },
        logMemberJoin: { type: 'string', description: '"true" or "false"' },
        logMemberLeave: { type: 'string', description: '"true" or "false"' },
        logVoiceJoinLeave: { type: 'string', description: '"true" or "false"' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Set up logging in #mod-logs with message deletes and member joins enabled', 'Enable voice join/leave logging'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const patch: Record<string, unknown> = {};
    if (params['logChannel']) {
      const channels = await guild.channels.fetch();
      const q = String(params['logChannel']).toLowerCase();
      const channel = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q));
      if (!channel) return { success: false, message: `Channel "${params['logChannel']}" not found` };
      patch.logChannelId = channel.id;
    }
    for (const key of ['logMessageDelete', 'logMessageEdit', 'logMemberJoin', 'logMemberLeave', 'logVoiceJoinLeave']) {
      if (params[key] !== undefined) patch[key] = String(params[key]).toLowerCase() === 'true';
    }

    const cfg = await setLogConfig(guild.id, patch);
    return {
      success: true,
      message: `📋 **Server logging updated**\n• Channel: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : '_none_'}\n• Message deletes: ${cfg.logMessageDelete}\n• Message edits: ${cfg.logMessageEdit}\n• Member joins: ${cfg.logMemberJoin}\n• Member leaves: ${cfg.logMemberLeave}\n• Voice: ${cfg.logVoiceJoinLeave}`,
    };
  }
}
