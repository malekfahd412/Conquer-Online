import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getGuildLogConfig, EVENT_LOG_TYPES, LOG_TYPE_META } from '../../discord/logging/log-store';

export class ViewServerLoggingTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'view_server_logging',
    description: 'Shows the current server event logging configuration — all log types, their enabled status, and assigned channels.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show logging config', 'What logs are enabled?'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const cfg = await getGuildLogConfig(guild.id);

    const lines: string[] = [];
    for (const type of EVENT_LOG_TYPES) {
      const meta = LOG_TYPE_META[type];
      const tc = cfg.types[type];
      const status = tc?.enabled ? '✅' : '❌';
      const ch = tc?.channelId ? `<#${tc.channelId}>` : '_none_';
      lines.push(`${status} ${meta.emoji} **${meta.label}** — ${ch}`);
    }

    const allCfg = cfg.types['logs_all'];
    const fallback = allCfg?.enabled
      ? (allCfg.channelId ? `✅ <#${allCfg.channelId}>` : '✅ enabled but no channel set')
      : '❌ disabled';

    return {
      success: true,
      message: `📋 **Server Logging Configuration**\n\n${lines.join('\n')}\n\n📋 **Fallback (Logs All Server):** ${fallback}`,
    };
  }
}
