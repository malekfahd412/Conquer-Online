import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class OptimizeChannelLayoutTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'optimize_channel_layout',
    description: 'Analyzes channel layout and suggests improvements: channels without topics, miscategorized channels, naming conventions, and structure best practices.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const suggestions: string[] = [];
    const channels = guild.channels.cache;

    // Text channels without topics
    const noTopic = channels.filter(c => c.type === ChannelType.GuildText && ('topic' in c) && !(c as { topic?: string }).topic).size;
    if (noTopic > 3) suggestions.push(`📝 **${noTopic}** text channels have no topic description — add topics for clarity`);

    // Uncategorized channels
    const uncategorized = channels.filter(c => c.type !== ChannelType.GuildCategory && !('parentId' in c && (c as { parentId?: string }).parentId)).size;
    if (uncategorized > 0) suggestions.push(`📁 **${uncategorized}** channel(s) are uncategorized — organize into categories for better navigation`);

    // Naming conventions (dashes vs underscores)
    const withDashes = channels.filter(c => c.name.includes('-')).size;
    const withUnderscores = channels.filter(c => c.name.includes('_')).size;
    if (withDashes > 2 && withUnderscores > 2) suggestions.push(`🔤 Mixed naming: ${withDashes} channels use dashes, ${withUnderscores} use underscores — pick one convention`);

    // Categories with too many channels
    const overloadedCats = channels.filter(c => {
      if (c.type !== ChannelType.GuildCategory) return false;
      const children = channels.filter(ch => 'parentId' in ch && (ch as { parentId?: string }).parentId === c.id);
      return children.size > 12;
    });
    for (const [, cat] of overloadedCats) {
      suggestions.push(`✂️ Category **${cat.name}** has too many channels — split into subcategories`);
    }

    // NSFW channels not in own category
    const nsfwChs = channels.filter(c => c.type === ChannelType.GuildText && 'nsfw' in c && c.nsfw);
    for (const [, ch] of nsfwChs) {
      const parentId = 'parentId' in ch ? (ch as { parentId?: string }).parentId : null;
      const parent = parentId ? channels.get(parentId) : null;
      if (!parent || !parent.name.toLowerCase().includes('nsfw') && !parent.name.toLowerCase().includes('adult') && !parent.name.toLowerCase().includes('18')) {
        suggestions.push(`🔞 **#${ch.name}** is NSFW but not in a clearly labeled NSFW category`);
      }
    }

    const lines = [
      `📺 **Channel Layout Optimization** — **${guild.name}**`,
      `Total channels: ${channels.size}`,
      '',
      suggestions.length > 0 ? `**${suggestions.length} Suggestion(s):**\n${suggestions.slice(0, 10).join('\n')}` : '✅ Channel layout looks well-organized!',
    ];

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
