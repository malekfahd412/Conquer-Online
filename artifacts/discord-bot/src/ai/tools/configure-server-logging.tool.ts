import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { setTypeConfig, type LogType } from '../../discord/logging/log-store';

const LOG_TYPE_NAMES: Record<string, LogType> = {
  invite_in: 'invite_in', join: 'invite_in',
  invite_out: 'invite_out', leave: 'invite_out',
  verification: 'verification',
  timeout: 'timeout',
  kick: 'kick',
  ban: 'ban',
  voice_join: 'voice_join',
  voice_leave: 'voice_leave',
  voice_move: 'voice_move',
  role_given: 'role_given',
  role_removed: 'role_removed',
  message_deleted: 'message_deleted',
  logs_all: 'logs_all',
};

export class ConfigureServerLoggingTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_server_logging',
    description:
      'Configure server event logging. Set a fallback channel (logs_all) and enable/disable individual log types ' +
      '(invite_in, invite_out, verification, timeout, kick, ban, voice_join, voice_leave, voice_move, role_given, role_removed, message_deleted). ' +
      'Each type can have its own channel; unset types fall back to logs_all.',
    parameters: {
      type: 'object',
      properties: {
        logType: {
          type: 'string',
          description: 'Log type to configure: logs_all | invite_in | invite_out | verification | timeout | kick | ban | voice_join | voice_leave | voice_move | role_given | role_removed | message_deleted',
        },
        channelName: { type: 'string', description: 'Channel name or ID for this log type. Leave empty to clear.' },
        enabled: { type: 'string', description: '"true" to enable, "false" to disable' },
      },
      required: ['logType'],
    },
    dangerous: false,
    examples: [
      'Enable ban logging in #mod-logs',
      'Set logs_all fallback to #server-logs and enable it',
      'Disable voice_join logging',
    ],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const rawType = String(params['logType'] ?? '').toLowerCase().replace(/ /g, '_');
    const logType = LOG_TYPE_NAMES[rawType];
    if (!logType) {
      return { success: false, message: `Unknown log type "${rawType}". Valid types: logs_all, invite_in, invite_out, verification, timeout, kick, ban, voice_join, voice_leave, voice_move, role_given, role_removed, message_deleted` };
    }

    const patch: { enabled?: boolean; channelId?: string } = {};

    if (params['enabled'] !== undefined) {
      patch.enabled = String(params['enabled']).toLowerCase() === 'true';
    }
    if (params['channelName']) {
      const q = String(params['channelName']).toLowerCase();
      const channels = await guild.channels.fetch();
      const ch = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q));
      if (!ch) return { success: false, message: `Channel "${params['channelName']}" not found.` };
      patch.channelId = ch.id;
    }

    const cfg = await setTypeConfig(guild.id, logType, patch);
    const channelStr = cfg.channelId ? `<#${cfg.channelId}>` : '_none_';
    return {
      success: true,
      message: `✅ **${logType}** logging updated\n• Enabled: ${cfg.enabled}\n• Channel: ${channelStr}`,
    };
  }
}
