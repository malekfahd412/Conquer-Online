import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneServerStructureTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_server_structure',
    description: 'Clones the entire channel structure (categories + channels) with a suffix. Maintains category-channel relationships.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix for cloned names (default: "-clone")' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const chs = guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice).size;
      return { success: false, message: `This will clone ${cats} categories and ${chs} channels. Set \`confirm: "CONFIRM"\` to proceed.` };
    }
    const suffix = String(params['suffix'] ?? '-clone');

    // Clone categories first, build ID map
    const catIdMap: Record<string, string> = {};
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
    for (const [, cat] of categories) {
      try {
        const newCat = await guild.channels.create({ name: `${cat.name}${suffix}`.slice(0, 100), type: ChannelType.GuildCategory, reason: 'Clone server structure' });
        catIdMap[cat.id] = newCat.id;
      } catch { /* skip */ }
    }

    // Clone channels
    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice).sort((a, b) => a.rawPosition - b.rawPosition);
    let chCreated = 0;
    for (const [, ch] of channels) {
      const originalParentId = 'parentId' in ch ? (ch as { parentId?: string | null }).parentId ?? null : null;
      const newParentId = originalParentId ? catIdMap[originalParentId] : undefined;
      try {
        await guild.channels.create({ name: `${ch.name}${suffix}`.slice(0, 100), type: ch.type as ChannelType, parent: newParentId, reason: 'Clone server structure' });
        chCreated++;
      } catch { /* skip */ }
    }

    return {
      success: true,
      message: `✅ **Server structure cloned**\nCategories: ${Object.keys(catIdMap).length} | Channels: ${chCreated}\nAll clones have suffix \`${suffix}\`.`,
    };
  }
}
