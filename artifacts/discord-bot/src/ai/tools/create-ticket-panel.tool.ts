import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { createPanel } from '../../discord/tickets/ticket-store';
import { ticketService } from '../../discord/tickets/ticket.service';

export class CreateTicketPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_ticket_panel',
    description: 'Creates a new ticket panel (embed + open button) in a channel. Supports Support, Purchase, Report Player, Appeal, Bug Report, Staff Contact, Developer, or Custom ticket types.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to post the panel in' },
        title: { type: 'string', description: 'Panel embed title' },
        description: { type: 'string', description: 'Panel embed description' },
        buttonLabel: { type: 'string', description: 'Label for the open-ticket button' },
        ticketType: { type: 'string', description: 'Type of ticket (e.g. Support, Purchase, Report Player, Appeal, Bug Report, Staff Contact, Developer, Custom)' },
        category: { type: 'string', description: 'Category name/ID where new ticket channels are created (optional)' },
        supportRoles: { type: 'string', description: 'Comma-separated role names/IDs given access to tickets (optional)' },
        transcriptChannel: { type: 'string', description: 'Channel to post closed-ticket transcripts (optional)' },
        logChannel: { type: 'string', description: 'Channel to post ticket open/close logs (optional)' },
        maxTicketsPerUser: { type: 'number', description: 'Max simultaneously open tickets per user (default 1)' },
        namingFormat: { type: 'string', description: 'Ticket channel naming format, supports {number} {username} {type} (default: ticket-{number})' },
      },
      required: ['channel', 'title', 'description', 'buttonLabel', 'ticketType'],
    },
    dangerous: false,
    examples: ['Create a support ticket panel in #tickets', 'Set up a purchase ticket panel with button "Buy Now"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const channels = await guild.channels.fetch();
    const channel = channels.find(c => c && (c.id === channelQuery || c.name.toLowerCase() === channelQuery));
    if (!channel) return { success: false, message: `Channel "${params['channel']}" not found` };

    let categoryId: string | undefined;
    if (params['category']) {
      const catQuery = String(params['category']).toLowerCase();
      const cat = channels.find(c => c && (c.id === catQuery || c.name.toLowerCase() === catQuery) && c.type === 4);
      categoryId = cat?.id;
    }

    const roles = await guild.roles.fetch();
    const supportRoleIds = String(params['supportRoles'] ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(q => roles.find(r => r.id === q || r.name.toLowerCase() === q.toLowerCase())?.id)
      .filter((id): id is string => !!id);

    let transcriptChannelId: string | undefined;
    if (params['transcriptChannel']) {
      const q = String(params['transcriptChannel']).toLowerCase();
      transcriptChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
    }
    let logChannelId: string | undefined;
    if (params['logChannel']) {
      const q = String(params['logChannel']).toLowerCase();
      logChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
    }

    const panel = await createPanel({
      guildId: guild.id,
      channelId: channel.id,
      title: String(params['title']),
      description: String(params['description']),
      color: 0x5865f2,
      buttons: [{ label: String(params['buttonLabel']), style: 'Primary', ticketType: String(params['ticketType']) }],
      categoryId,
      supportRoleIds,
      allowedRoleIds: [],
      blockedRoleIds: [],
      maxTicketsPerUser: Number(params['maxTicketsPerUser'] ?? 1),
      namingFormat: String(params['namingFormat'] ?? 'ticket-{number}'),
      transcriptChannelId,
      logChannelId,
      autoClose: false,
      autoDelete: false,
      inactiveTimeoutMinutes: 0,
    });

    await ticketService.postPanel(guild, panel);

    return {
      success: true,
      message: `🎫 **Ticket panel created** in <#${channel.id}>\n• Panel ID: \`${panel.id}\`\n• Type: ${params['ticketType']}\n• Support roles: ${supportRoleIds.length}\n• Max per user: ${panel.maxTicketsPerUser}`,
    };
  }
}
