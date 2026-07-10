import { ChannelType, PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { promises as fs } from 'fs';
import path from 'path';

const PERM_NAMES: Array<[string, bigint]> = [
  ['View Channel', PermissionsBitField.Flags.ViewChannel],
  ['Send Messages', PermissionsBitField.Flags.SendMessages],
  ['Read Message History', PermissionsBitField.Flags.ReadMessageHistory],
  ['Manage Messages', PermissionsBitField.Flags.ManageMessages],
  ['Manage Channels', PermissionsBitField.Flags.ManageChannels],
  ['Manage Roles', PermissionsBitField.Flags.ManageRoles],
  ['Kick Members', PermissionsBitField.Flags.KickMembers],
  ['Ban Members', PermissionsBitField.Flags.BanMembers],
  ['Moderate Members', PermissionsBitField.Flags.ModerateMembers],
  ['Administrator', PermissionsBitField.Flags.Administrator],
  ['Mention Everyone', PermissionsBitField.Flags.MentionEveryone],
  ['Attach Files', PermissionsBitField.Flags.AttachFiles],
  ['Embed Links', PermissionsBitField.Flags.EmbedLinks],
  ['Use Slash Commands', PermissionsBitField.Flags.UseApplicationCommands],
  ['Connect (Voice)', PermissionsBitField.Flags.Connect],
  ['Speak (Voice)', PermissionsBitField.Flags.Speak],
  ['Move Members (Voice)', PermissionsBitField.Flags.MoveMembers],
];

export class GeneratePermissionDocsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'generate_permission_docs',
    description: 'Generates a Markdown permission matrix document: roles × key permissions, and channel-specific overwrite summaries.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (default: permission_docs.md)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const filename = String(params['filename'] ?? 'permission_docs.md').replace(/\.\./g, '');
    const filePath = path.join(process.cwd(), 'data', filename);

    const roles = [...guild.roles.cache.values()].filter(r => !r.managed).sort((a, b) => b.position - a.position);

    const lines: string[] = [
      `# ${guild.name} — Permission Documentation`,
      `Generated: ${new Date().toUTCString()}`,
      '',
      '## Role Permission Matrix',
      '',
      `| Role | ${PERM_NAMES.map(([n]) => n).join(' | ')} |`,
      `|------|${PERM_NAMES.map(() => '---').join('|')}|`,
    ];

    for (const role of roles.slice(0, 20)) {
      const cells = PERM_NAMES.map(([, flag]) => role.permissions.has(flag) ? '✅' : '❌');
      lines.push(`| **${role.name}** | ${cells.join(' | ')} |`);
    }

    lines.push('', '## @everyone Permissions', '');
    const evPerm = guild.roles.everyone.permissions;
    for (const [name, flag] of PERM_NAMES) {
      lines.push(`- ${evPerm.has(flag) ? '✅' : '❌'} ${name}`);
    }

    lines.push('', '## Channel Overwrite Summary', '');
    const textChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    for (const [, ch] of [...textChs].slice(0, 20)) {
      const owCount = ch.permissionOverwrites.cache.size;
      if (owCount > 0) {
        lines.push(`### #${ch.name} (${owCount} overwrite(s))`);
        for (const [, ow] of ch.permissionOverwrites.cache) {
          const isRole = ow.type === 0;
          const target = isRole ? (guild.roles.cache.get(ow.id)?.name ?? ow.id) : ow.id;
          const allowList = ow.allow.toArray().slice(0, 5).join(', ') || '—';
          const denyList = ow.deny.toArray().slice(0, 5).join(', ') || '—';
          lines.push(`- ${isRole ? '🎭' : '👤'} **${target}**: Allow: ${allowList} | Deny: ${denyList}`);
        }
      }
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    return {
      success: true,
      message: `📄 **Permission documentation generated** → \`data/${filename}\`\n${roles.length} roles × ${PERM_NAMES.length} permissions documented.`,
      data: { filePath },
    };
  }
}
