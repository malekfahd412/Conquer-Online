import { ChannelType } from 'discord.js';
import type { Guild, TextChannel, VoiceChannel, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const CHANNEL_TYPE_LABELS: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Media',
  [ChannelType.PublicThread]: 'Public Thread',
  [ChannelType.PrivateThread]: 'Private Thread',
  [ChannelType.AnnouncementThread]: 'Announcement Thread',
};

export class ChannelInfoTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'channel_info',
    description: 'Shows detailed information about a channel: type, topic, permissions, slowmode, creation date, etc.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Show info for #general', 'What are the settings for the staff channel?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(c => c.name.toLowerCase() === name) as GuildChannel | undefined;

    if (!channel) return { success: false, message: `Channel "${params['name']}" not found` };

    const typeLabel = CHANNEL_TYPE_LABELS[channel.type as ChannelType] ?? `Unknown (${channel.type})`;
    const parent = channel.parentId ? guild.channels.cache.get(channel.parentId) : null;

    const lines = [
      `**📋 #${channel.name}**`,
      `• Type: ${typeLabel}`,
      `• ID: ${channel.id}`,
      `• Position: ${channel.position}`,
      `• Category: ${parent ? parent.name : 'None'}`,
      `• Created: <t:${Math.floor(channel.createdTimestamp! / 1000)}:D>`,
    ];

    if (channel.type === ChannelType.GuildText) {
      const tc = channel as TextChannel;
      if (tc.topic) lines.push(`• Topic: ${tc.topic}`);
      if (tc.rateLimitPerUser) lines.push(`• Slowmode: ${tc.rateLimitPerUser}s`);
      lines.push(`• NSFW: ${tc.nsfw ? 'Yes' : 'No'}`);
    }

    if (channel.type === ChannelType.GuildVoice) {
      const vc = channel as VoiceChannel;
      lines.push(`• Bitrate: ${vc.bitrate / 1000}kbps`);
      lines.push(`• User Limit: ${vc.userLimit === 0 ? 'Unlimited' : vc.userLimit}`);
      if (vc.rtcRegion) lines.push(`• Region: ${vc.rtcRegion}`);
      lines.push(`• Members: ${vc.members.size}`);
    }

    return { success: true, message: lines.join('\n') };
  }
}
