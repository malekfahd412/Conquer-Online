import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneCompleteLayoutTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_complete_layout',
    description: 'Clones the complete server layout: categories, channels, and roles simultaneously. The largest batch operation for duplicating server structure.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix for all cloned names (default: "-clone")' },
        include_roles: { type: 'string', description: 'Set to "false" to skip role cloning (default: true)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const chs = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).size;
      const roles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).size;
      return { success: false, message: `This will clone ${cats} categories, ${chs} channels, and ${roles} roles. Set \`confirm: "CONFIRM"\` to proceed.` };
    }
    const suffix = String(params['suffix'] ?? '-clone');
    const includeRoles = String(params['include_roles'] ?? 'true').toLowerCase() !== 'false';

    const created = { categories: 0, channels: 0, roles: 0 };
    const catIdMap: Record<string, string> = {};

    // Categories
    const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
    for (const [, cat] of cats) {
      try {
        const n = await guild.channels.create({ name: `${cat.name}${suffix}`.slice(0, 100), type: ChannelType.GuildCategory, reason: 'Clone complete layout' });
        catIdMap[cat.id] = n.id;
        created.categories++;
      } catch { /* skip */ }
    }

    // Channels
    const chs = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).sort((a, b) => (('rawPosition' in a ? (a as { rawPosition: number }).rawPosition : 0) - ('rawPosition' in b ? (b as { rawPosition: number }).rawPosition : 0)));
    for (const [, ch] of chs) {
      const origParent = 'parentId' in ch ? (ch as { parentId?: string | null }).parentId ?? null : null;
      const newParent = origParent ? catIdMap[origParent] : undefined;
      try {
        await guild.channels.create({ name: `${ch.name}${suffix}`.slice(0, 100), type: ch.type as never, parent: newParent, reason: 'Clone complete layout' });
        created.channels++;
      } catch { /* skip */ }
    }

    // Roles
    if (includeRoles) {
      const roles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).sort((a, b) => a.position - b.position);
      for (const [, role] of roles) {
        try {
          await guild.roles.create({ name: `${role.name}${suffix}`.slice(0, 100), color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions, reason: 'Clone complete layout' });
          created.roles++;
        } catch { /* skip */ }
      }
    }

    return {
      success: true,
      message: `✅ **Complete layout cloned** (suffix: \`${suffix}\`)\nCategories: ${created.categories} | Channels: ${created.channels} | Roles: ${created.roles}`,
    };
  }
}
