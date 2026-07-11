import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { ticketSystem } from '../../community/tickets';
import type { TicketPanel } from '../../community/tickets/types';

export class ConfigureTicketSettingsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_ticket_settings',
    description: 'Updates settings for an existing ticket panel: support roles, max tickets per user, naming format, transcript/log/archive channels, cooldown.',
    parameters: {
      type: 'object',
      properties: {
        panelId: { type: 'string', description: 'The panel ID (from list_ticket_panels)' },
        supportRoles: { type: 'string', description: 'Comma-separated role names/IDs (optional)' },
        maxTicketsPerUser: { type: 'number', description: 'Max simultaneously open tickets per user (optional)' },
        namingFormat: { type: 'string', description: 'Naming format, supports {counter} {username} {userid} {displayname} {date} {time} (optional)' },
        transcriptChannel: { type: 'string', description: 'Transcript channel name/ID (optional)' },
        logChannel: { type: 'string', description: 'Log channel name/ID (optional)' },
        archiveCategory: { type: 'string', description: 'Category to move closed tickets into (optional)' },
        autoDelete: { type: 'string', description: '"true" or "false" — delete channel automatically after close (optional)' },
        cooldownSeconds: { type: 'number', description: 'Seconds a user must wait after closing before opening another ticket on this panel (optional)' },
      },
      required: ['panelId'],
    },
    dangerous: false,
    examples: ['Set max tickets per user to 2 for panel_123', 'Set transcript channel for panel_123 to #transcripts'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panelId = String(params['panelId'] ?? '');
    const panel = await ticketSystem.panels.get(panelId);
    if (!panel || panel.guildId !== guild.id) return { success: false, message: `Panel "${panelId}" not found` };

    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();
    const patch: Partial<TicketPanel> = {};

    if (params['supportRoles']) {
      const ids = String(params['supportRoles']).split(',').map(s => s.trim()).filter(Boolean)
        .map(q => roles.find(r => r.id === q || r.name.toLowerCase() === q.toLowerCase())?.id)
        .filter((id): id is string => !!id);
      patch.supportRoles = ids;
      patch.pingRoles = ids;
    }
    if (params['maxTicketsPerUser'] !== undefined) patch.ticketLimit = Number(params['maxTicketsPerUser']);
    if (params['namingFormat']) patch.namingScheme = String(params['namingFormat']);
    if (params['cooldownSeconds'] !== undefined) patch.cooldown = Number(params['cooldownSeconds']);

    if (params['transcriptChannel']) {
      const q = String(params['transcriptChannel']).toLowerCase();
      const transcriptChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
      patch.transcript = { ...panel.transcript, enabled: !!transcriptChannelId, channelId: transcriptChannelId };
    }
    if (params['logChannel']) {
      const q = String(params['logChannel']).toLowerCase();
      patch.logChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
    }
    if (params['archiveCategory']) {
      patch.archiveCategory = await ticketSystem.categories.resolveCategoryId(guild, String(params['archiveCategory']));
    }
    if (params['autoDelete'] !== undefined) {
      const enabled = String(params['autoDelete']).toLowerCase() === 'true';
      patch.automation = { ...panel.automation, autoDeleteAfterCloseMinutes: enabled ? 1 / 6 : 0 };
    }

    await ticketSystem.panels.update(panelId, patch);
    return { success: true, message: `⚙️ Ticket panel \`${panelId}\` settings updated.` };
  }
}
