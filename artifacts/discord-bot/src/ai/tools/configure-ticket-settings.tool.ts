import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getPanel, updatePanelConfig } from '../../discord/tickets/ticket-store';

export class ConfigureTicketSettingsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_ticket_settings',
    description: 'Updates settings for an existing ticket panel: support roles, max tickets per user, naming format, transcript/log/archive channels.',
    parameters: {
      type: 'object',
      properties: {
        panelId: { type: 'string', description: 'The panel ID (from list_ticket_panels)' },
        supportRoles: { type: 'string', description: 'Comma-separated role names/IDs (optional)' },
        maxTicketsPerUser: { type: 'number', description: 'Max simultaneously open tickets per user (optional)' },
        namingFormat: { type: 'string', description: 'Naming format, supports {number} {username} {type} (optional)' },
        transcriptChannel: { type: 'string', description: 'Transcript channel name/ID (optional)' },
        logChannel: { type: 'string', description: 'Log channel name/ID (optional)' },
        archiveCategory: { type: 'string', description: 'Category to move closed tickets into (optional)' },
        autoDelete: { type: 'string', description: '"true" or "false" — delete channel automatically after close (optional)' },
      },
      required: ['panelId'],
    },
    dangerous: false,
    examples: ['Set max tickets per user to 2 for panel_123', 'Set transcript channel for panel_123 to #transcripts'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panelId = String(params['panelId'] ?? '');
    const panel = await getPanel(panelId);
    if (!panel || panel.guildId !== guild.id) return { success: false, message: `Panel "${panelId}" not found` };

    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();
    const patch: Record<string, unknown> = {};

    if (params['supportRoles']) {
      patch.supportRoleIds = String(params['supportRoles']).split(',').map(s => s.trim()).filter(Boolean)
        .map(q => roles.find(r => r.id === q || r.name.toLowerCase() === q.toLowerCase())?.id)
        .filter((id): id is string => !!id);
    }
    if (params['maxTicketsPerUser'] !== undefined) patch.maxTicketsPerUser = Number(params['maxTicketsPerUser']);
    if (params['namingFormat']) patch.namingFormat = String(params['namingFormat']);
    if (params['transcriptChannel']) {
      const q = String(params['transcriptChannel']).toLowerCase();
      patch.transcriptChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
    }
    if (params['logChannel']) {
      const q = String(params['logChannel']).toLowerCase();
      patch.logChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
    }
    if (params['archiveCategory']) {
      const q = String(params['archiveCategory']).toLowerCase();
      patch.archiveCategoryId = channels.find(c => c && c.type === 4 && (c.id === q || c.name.toLowerCase() === q))?.id;
    }
    if (params['autoDelete'] !== undefined) patch.autoDelete = String(params['autoDelete']).toLowerCase() === 'true';

    await updatePanelConfig(panelId, patch);
    return { success: true, message: `⚙️ Ticket panel \`${panelId}\` settings updated.` };
  }
}
