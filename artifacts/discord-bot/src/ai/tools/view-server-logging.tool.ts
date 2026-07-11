import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getLogConfig } from '../../discord/logging/log-store';

export class ViewServerLoggingTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'view_server_logging',
    description: 'Shows the current server event logging configuration.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show logging config'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const cfg = await getLogConfig(guild.id);
    return {
      success: true,
      message: `📋 **Server Logging**\n• Channel: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : '_none_'}\n• Message deletes: ${cfg.logMessageDelete}\n• Message edits: ${cfg.logMessageEdit}\n• Member joins: ${cfg.logMemberJoin}\n• Member leaves: ${cfg.logMemberLeave}\n• Voice: ${cfg.logVoiceJoinLeave}`,
    };
  }
}
