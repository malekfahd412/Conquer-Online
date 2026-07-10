import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnusedEmojisReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unused_emojis_report',
    description: 'Lists server emojis that appear unused: not restricted to any role. Note: Discord does not expose emoji usage frequency — this report flags emojis with role restrictions that are configured but may be unnecessary.',
    parameters: {
      type: 'object',
      properties: {
        show_all: { type: 'string', description: 'Set to "true" to list all emojis with their restriction status' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const showAll = String(params['show_all'] ?? '').toLowerCase() === 'true';
    const emojis = guild.emojis.cache;

    if (emojis.size === 0) return { success: true, message: `**${guild.name}** has no custom emojis` };

    const restricted = emojis.filter(e => e.roles.cache.size > 0);
    const unrestricted = emojis.filter(e => e.roles.cache.size === 0);

    const lines = [
      `😀 **Emoji Report** — **${guild.name}** (${emojis.size} total)`,
      `Unrestricted (available to all): **${unrestricted.size}**`,
      `Role-restricted: **${restricted.size}**`,
      '',
    ];

    if (restricted.size > 0) {
      lines.push('**🔒 Role-restricted emojis:**');
      for (const [, e] of restricted) {
        const roleNames = e.roles.cache.map(r => r.name).join(', ');
        lines.push(`  • **:${e.name}:** — restricted to: ${roleNames}`);
      }
      lines.push('');
    }

    if (showAll) {
      lines.push('**All emojis:**');
      const chunks: string[] = [];
      for (const [, e] of unrestricted) chunks.push(`:${e.name}:`);
      lines.push(chunks.slice(0, 50).join(' '));
      if (chunks.length > 50) lines.push(`_...and ${chunks.length - 50} more_`);
    }

    lines.push(`\n💡 _Discord does not expose emoji usage frequency. Use \`cleanup_unused_emojis\` to bulk-delete emojis after manual review._`);

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
