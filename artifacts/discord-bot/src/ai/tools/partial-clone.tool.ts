import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PartialCloneTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'partial_clone',
    description: 'Clones a selective subset of channels or roles by name. Specify exactly which resources to clone.',
    parameters: {
      type: 'object',
      properties: {
        channels: { type: 'string', description: 'Comma-separated channel names to clone' },
        roles: { type: 'string', description: 'Comma-separated role names to clone' },
        suffix: { type: 'string', description: 'Suffix to append to cloned names (default: "-clone")' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: 'Partial clone requires `confirm: "CONFIRM"`' };
    }
    const chNames = String(params['channels'] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const roleNames = String(params['roles'] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const suffix = String(params['suffix'] ?? '-clone');

    if (!chNames.length && !roleNames.length) return { success: false, message: 'Specify at least channels or roles to clone' };

    const created: string[] = [];
    const notFound: string[] = [];

    for (const name of chNames) {
      const ch = guild.channels.cache.find(c => c.name.toLowerCase() === name && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice));
      if (!ch) { notFound.push(`channel "${name}"`); continue; }
      try {
        await guild.channels.create({ name: `${ch.name}${suffix}`.slice(0, 100), type: ch.type as never, reason: 'Partial clone' });
        created.push(`#${ch.name}${suffix}`);
      } catch { notFound.push(`failed: channel "${name}"`); }
    }

    for (const name of roleNames) {
      const role = guild.roles.cache.find(r => r.name.toLowerCase() === name && !r.managed);
      if (!role) { notFound.push(`role "${name}"`); continue; }
      try {
        await guild.roles.create({ name: `${role.name}${suffix}`.slice(0, 100), color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions, reason: 'Partial clone' });
        created.push(`@${role.name}${suffix}`);
      } catch { notFound.push(`failed: role "${name}"`); }
    }

    const lines = [`✅ **Partial clone** — created ${created.length} item(s):`];
    if (created.length) lines.push(created.map(n => `• \`${n}\``).join('\n'));
    if (notFound.length) lines.push(`\n⚠️ Not found/failed: ${notFound.join(', ')}`);

    return { success: true, message: lines.join('\n') };
  }
}
