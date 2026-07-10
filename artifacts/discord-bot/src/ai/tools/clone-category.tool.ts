import { ChannelType } from 'discord.js';
import type { Guild, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_category',
    description: 'Clones a category (and all its channels) with an optional new name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to clone' },
        new_name: { type: 'string', description: 'Name for the cloned category (optional, defaults to "name-copy")' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Clone the General category', 'Duplicate Events as "Events 2"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as CategoryChannel | undefined;

    if (!category) return { success: false, message: `Category "${params['name']}" not found` };

    const newName = params['new_name'] ? String(params['new_name']).trim() : `${category.name}-copy`;
    const clonedCategory = await guild.channels.create({
      name: newName,
      type: ChannelType.GuildCategory,
      position: category.position + 1,
      permissionOverwrites: category.permissionOverwrites.cache.map(po => ({
        id: po.id,
        allow: po.allow,
        deny: po.deny,
      })),
    });

    const children = guild.channels.cache
      .filter(c => (c as { parentId?: string | null }).parentId === category.id)
      .sort((a, b) => (a as CategoryChannel).position - (b as CategoryChannel).position);

    let clonedCount = 0;
    for (const child of children.values()) {
      await guild.channels.create({
        name: child.name,
        type: child.type as ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildAnnouncement,
        parent: clonedCategory.id,
        permissionOverwrites: (child as { permissionOverwrites?: { cache: Map<string, unknown> } }).permissionOverwrites?.cache
          ? Array.from((child as CategoryChannel).permissionOverwrites.cache.values()).map(po => ({
              id: po.id,
              allow: po.allow,
              deny: po.deny,
            }))
          : [],
      });
      clonedCount++;
    }

    return {
      success: true,
      message: `Cloned category **${category.name}** → **${clonedCategory.name}** with ${clonedCount} channel(s)`,
    };
  }
}
