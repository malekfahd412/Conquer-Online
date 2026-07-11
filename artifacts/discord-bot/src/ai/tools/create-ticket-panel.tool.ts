import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { ticketSystem } from '../../community/tickets';
import { defaultPanelFields, defaultEmbed, defaultButton } from '../../community/tickets/panel-defaults';

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
        namingFormat: { type: 'string', description: 'Ticket channel naming format, supports {counter} {username} {userid} {displayname} {date} {time} (default: ticket-{counter})' },
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

    let openCategory: string | undefined;
    if (params['category']) {
      openCategory = await ticketSystem.categories.resolveCategoryId(guild, String(params['category']));
    }

    const roles = await guild.roles.fetch();
    const supportRoles = String(params['supportRoles'] ?? '')
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

    const panel = await ticketSystem.panels.create(guild.id, {
      name: String(params['title']),
      description: String(params['description']),
      channelId: channel.id,
      embed: defaultEmbed(String(params['title']), String(params['description'])),
      button: defaultButton(String(params['buttonLabel']), String(params['ticketType'])),
      ...defaultPanelFields(),
      openCategory,
      supportRoles,
      managerRoles: supportRoles,
      pingRoles: supportRoles,
      transcript: { enabled: !!transcriptChannelId, channelId: transcriptChannelId, formats: ['html'], dmUser: false },
      logChannelId,
      ticketLimit: Number(params['maxTicketsPerUser'] ?? 1),
      namingScheme: String(params['namingFormat'] ?? 'ticket-{counter}'),
    });

    await ticketSystem.panels.publish(guild, panel);

    return {
      success: true,
      message: `🎫 **Ticket panel created** in <#${channel.id}>\n• Panel ID: \`${panel.id}\`\n• Type: ${params['ticketType']}\n• Support roles: ${supportRoles.length}\n• Max per user: ${panel.ticketLimit}`,
    };
  }
}
