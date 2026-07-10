import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ClonePreviewTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_preview',
    description: 'Shows a preview of what would be created by a clone operation — all channels, roles, and categories — without actually creating anything.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix to show in preview (default: "-clone")' },
        include: {
          type: 'string',
          description: 'What to preview: categories, channels, roles, all (default: all)',
          enum: ['categories', 'channels', 'roles', 'all'],
        },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const suffix = String(params['suffix'] ?? '-clone');
    const include = String(params['include'] ?? 'all').toLowerCase();

    const lines = [`🔮 **Clone Preview** — **${guild.name}** (suffix: \`${suffix}\`)\n`];

    if (include === 'all' || include === 'categories') {
      const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
      lines.push(`**📁 Categories (${cats.size} → ${cats.size} copies):**`);
      for (const [, cat] of cats) lines.push(`  • \`${cat.name}\` → \`${cat.name}${suffix}\``);
      lines.push('');
    }

    if (include === 'all' || include === 'channels') {
      const chs = guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice).sort((a, b) => a.rawPosition - b.rawPosition);
      lines.push(`**📺 Channels (${chs.size} → ${chs.size} copies):**`);
      for (const [, ch] of chs.first ? [...chs.values()].slice(0, 15) : []) {
        lines.push(`  • \`${ch.name}\` → \`${ch.name}${suffix}\``);
      }
      if (chs.size > 15) lines.push(`  _...and ${chs.size - 15} more_`);
      lines.push('');
    }

    if (include === 'all' || include === 'roles') {
      const roles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).sort((a, b) => b.position - a.position);
      lines.push(`**🎭 Roles (${roles.size} → ${roles.size} copies):**`);
      for (const [, r] of [...roles.entries()].slice(0, 15)) {
        lines.push(`  • \`${r.name}\` → \`${r.name}${suffix}\``);
      }
      if (roles.size > 15) lines.push(`  _...and ${roles.size - 15} more_`);
    }

    lines.push('\n_This is a preview only. No changes have been made._');
    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
