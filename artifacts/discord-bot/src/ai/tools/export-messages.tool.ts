import { promises as fs } from 'fs';
import path from 'path';
import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ExportMessagesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_messages',
    description: 'Exports recent messages from a channel to a JSON file in data/. Includes author, content, timestamp, and reactions.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        limit: { type: 'string', description: 'Number of messages to export (default 100, max 500)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Export last 200 messages from #general', 'Export messages from #mod-log'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const limit = Math.min(500, Math.max(1, parseInt(String(params['limit'] ?? '100'), 10) || 100));

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const messages = await ch.messages.fetch({ limit: Math.min(limit, 100) });
    const data = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(m => ({
      id: m.id,
      author: { id: m.author.id, username: m.author.username, bot: m.author.bot },
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      edited: m.editedAt?.toISOString() ?? null,
      pinned: m.pinned,
      reactions: m.reactions.cache.map(r => ({ emoji: r.emoji.name, count: r.count })),
      attachments: m.attachments.map(a => a.url),
      embeds: m.embeds.length,
    }));

    const filename = `messages-${ch.name}-${Date.now()}.json`;
    const filepath = path.join(process.cwd(), 'data', filename);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

    return {
      success: true,
      message: `✅ Exported **${data.length}** messages from **#${ch.name}** to \`data/${filename}\``,
    };
  }
}
