import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { promises as fs } from 'fs';
import path from 'path';

export class GenerateRoleDocsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'generate_role_docs',
    description: 'Generates Markdown documentation for all server roles: hierarchy, colors, permissions, member counts, and flags.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (default: role_docs.md)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const filename = String(params['filename'] ?? 'role_docs.md').replace(/\.\./g, '');
    const filePath = path.join(process.cwd(), 'data', filename);

    const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position);

    const lines: string[] = [
      `# ${guild.name} — Role Documentation`,
      `Generated: ${new Date().toUTCString()}`,
      `Total roles: ${roles.length}`,
      '',
      '## Role Hierarchy (highest → lowest)',
      '',
    ];

    for (const role of roles) {
      const memberCount = guild.members.cache.filter(m => m.roles.cache.has(role.id)).size;
      const color = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : 'No color';
      const flags: string[] = [];
      if (role.id === guild.id) flags.push('@everyone');
      if (role.managed) flags.push('Bot-managed');
      if (role.hoist) flags.push('Hoisted');
      if (role.mentionable) flags.push('Mentionable');
      if (role.permissions.has('Administrator')) flags.push('**ADMINISTRATOR**');

      lines.push(`### ${role.name} (pos: ${role.position})`);
      lines.push(`- Members: ${memberCount}`);
      lines.push(`- Color: ${color}`);
      lines.push(`- Flags: ${flags.length ? flags.join(', ') : 'None'}`);
      lines.push(`- Key Permissions: ${role.permissions.toArray().slice(0, 8).join(', ') || 'None'}`);
      lines.push('');
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    return {
      success: true,
      message: `📄 **Role documentation generated** → \`data/${filename}\`\n${roles.length} roles documented.`,
      data: { filePath },
    };
  }
}
