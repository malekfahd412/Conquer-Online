import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { promises as fs } from 'fs';
import path from 'path';

export class GenerateChannelDocsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'generate_channel_docs',
    description: 'Generates Markdown documentation for all server channels: structure, topics, settings, and permission overwrite counts.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (default: channel_docs.md)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const filename = String(params['filename'] ?? 'channel_docs.md').replace(/\.\./g, '');
    const filePath = path.join(process.cwd(), 'data', filename);

    const lines: string[] = [
      `# ${guild.name} — Channel Documentation`,
      `Generated: ${new Date().toUTCString()}`,
      `Total channels: ${guild.channels.cache.size}`,
      '',
    ];

    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
    const uncategorized = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory && !('parentId' in c && (c as { parentId?: string }).parentId));

    const describeChannel = (ch: { name: string; type: number; id: string; permissionOverwrites: { cache: Map<string, unknown> }; rawPosition?: number }) => {
      const typeLabel = ch.type === ChannelType.GuildText ? 'Text' : ch.type === ChannelType.GuildVoice ? 'Voice' : ch.type === ChannelType.GuildForum ? 'Forum' : ch.type === ChannelType.GuildAnnouncement ? 'Announcement' : ch.type === ChannelType.GuildStageVoice ? 'Stage' : `Type ${ch.type}`;
      const topic = 'topic' in ch ? (ch as { topic?: string }).topic : null;
      const nsfw = 'nsfw' in ch ? (ch as { nsfw?: boolean }).nsfw : false;
      const slowmode = 'rateLimitPerUser' in ch ? (ch as { rateLimitPerUser?: number }).rateLimitPerUser : 0;
      const bitrate = 'bitrate' in ch ? (ch as { bitrate?: number }).bitrate : null;
      const userLimit = 'userLimit' in ch ? (ch as { userLimit?: number }).userLimit : null;
      const owCount = ch.permissionOverwrites.cache.size;

      const props = [`Type: ${typeLabel}`, `ID: \`${ch.id}\``, `Overwrites: ${owCount}`];
      if (topic) props.push(`Topic: "${topic}"`);
      if (nsfw) props.push('NSFW: Yes');
      if (slowmode) props.push(`Slowmode: ${slowmode}s`);
      if (bitrate) props.push(`Bitrate: ${Math.round(bitrate / 1000)}kbps`);
      if (userLimit) props.push(`User limit: ${userLimit}`);

      return `#### #${ch.name}\n${props.map(p => `- ${p}`).join('\n')}`;
    };

    for (const [, cat] of categories) {
      lines.push(`## 📁 ${cat.name}`);
      lines.push(`- ID: \`${cat.id}\``);
      lines.push(`- Permission Overwrites: ${cat.permissionOverwrites.cache.size}`);
      lines.push('');
      const children = guild.channels.cache.filter(c => 'parentId' in c && (c as { parentId?: string }).parentId === cat.id).sort((a, b) => a.rawPosition - b.rawPosition);
      for (const [, ch] of children) lines.push(describeChannel(ch as Parameters<typeof describeChannel>[0]), '');
    }

    if (uncategorized.size > 0) {
      lines.push('## 📁 Uncategorized');
      for (const [, ch] of uncategorized) lines.push(describeChannel(ch as Parameters<typeof describeChannel>[0]), '');
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    return {
      success: true,
      message: `📄 **Channel documentation generated** → \`data/${filename}\`\n${guild.channels.cache.size} channels in ${categories.size} categories documented.`,
      data: { filePath },
    };
  }
}
