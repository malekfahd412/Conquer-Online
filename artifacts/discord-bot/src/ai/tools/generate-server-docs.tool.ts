import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { promises as fs } from 'fs';
import path from 'path';

export class GenerateServerDocsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'generate_server_docs',
    description: 'Generates comprehensive Markdown documentation for the entire server: structure, roles, channels, settings, and permission overview. Saved to a file.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (default: server_docs.md)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const filename = String(params['filename'] ?? 'server_docs.md').replace(/\.\./g, '').replace(/\W+(?=\.|$)/g, '_');
    const filePath = path.join(process.cwd(), 'data', filename);

    const lines: string[] = [
      `# ${guild.name} — Server Documentation`,
      `Generated: ${new Date().toUTCString()}`,
      `Guild ID: \`${guild.id}\``,
      '',
      '## Overview',
      `- Members: ${guild.memberCount}`,
      `- Boost Tier: ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
      `- Verification Level: ${guild.verificationLevel}`,
      `- Locale: ${guild.preferredLocale}`,
      `- Owner: <@${guild.ownerId}>`,
      '',
      '## Channel Structure',
    ];

    const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
    const uncategorized = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory && !('parentId' in c && (c as { parentId?: string }).parentId));

    for (const [, cat] of cats) {
      lines.push(`### 📁 ${cat.name}`);
      const children = guild.channels.cache.filter(c => 'parentId' in c && (c as { parentId?: string }).parentId === cat.id).sort((a, b) => a.rawPosition - b.rawPosition);
      for (const [, ch] of children) {
        const topic = 'topic' in ch && (ch as { topic?: string }).topic ? ` — ${(ch as { topic: string }).topic}` : '';
        const typeLabel = ch.type === ChannelType.GuildVoice ? '🔊' : ch.type === ChannelType.GuildForum ? '💬' : '#';
        lines.push(`- ${typeLabel} **${ch.name}**${topic}`);
      }
      lines.push('');
    }

    if (uncategorized.size > 0) {
      lines.push('### 📁 Uncategorized');
      for (const [, ch] of uncategorized) lines.push(`- # **${ch.name}**`);
      lines.push('');
    }

    lines.push('## Roles');
    const roles = guild.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position);
    for (const [, r] of roles) {
      const memberCount = guild.members.cache.filter(m => m.roles.cache.has(r.id)).size;
      const color = r.color ? `#${r.color.toString(16).padStart(6, '0')}` : 'no color';
      const flags = [r.hoist ? 'hoisted' : '', r.mentionable ? 'mentionable' : '', r.managed ? 'bot-managed' : ''].filter(Boolean).join(', ');
      lines.push(`- **${r.name}** — ${memberCount} member(s) | ${color} | pos: ${r.position}${flags ? ` | ${flags}` : ''}`);
    }
    lines.push('');

    lines.push('## Server Features');
    lines.push(guild.features.length ? guild.features.map(f => `- \`${f}\``).join('\n') : '- None');

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    return {
      success: true,
      message: `📄 **Server documentation generated** → \`data/${filename}\`\n${guild.channels.cache.size} channels | ${guild.roles.cache.size} roles | ${guild.emojis.cache.size} emojis documented.`,
      data: { filePath },
    };
  }
}
