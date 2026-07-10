import { PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionSimulatorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_simulator',
    description: 'Simulates what permissions a member WOULD have if they were assigned a specific role — without actually assigning the role.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
        add_role: { type: 'string', description: 'Role name to simulate adding to the member' },
      },
      required: ['user', 'add_role'],
    },
    dangerous: false,
    examples: ['Simulate what JohnDoe could do if given the Moderator role', 'What permissions would UserX have with the Admin role?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const roleName = String(params['add_role'] ?? '').toLowerCase().trim();

    const members = await guild.members.fetch();
    const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };

    const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
    if (!role) return { success: false, message: `Role "${params['add_role']}" not found` };

    const currentPerms = member.permissions;
    const simulated = new PermissionsBitField([...member.roles.cache.map(r => r.permissions), role.permissions]);

    const gained: string[] = [];
    const keyPerms: [string, bigint][] = [
      ['Administrator', PermissionsBitField.Flags.Administrator],
      ['Manage Server', PermissionsBitField.Flags.ManageGuild],
      ['Manage Channels', PermissionsBitField.Flags.ManageChannels],
      ['Manage Roles', PermissionsBitField.Flags.ManageRoles],
      ['Manage Messages', PermissionsBitField.Flags.ManageMessages],
      ['Kick Members', PermissionsBitField.Flags.KickMembers],
      ['Ban Members', PermissionsBitField.Flags.BanMembers],
      ['Moderate Members', PermissionsBitField.Flags.ModerateMembers],
      ['Mention Everyone', PermissionsBitField.Flags.MentionEveryone],
      ['Move Members', PermissionsBitField.Flags.MoveMembers],
    ];

    for (const [label, flag] of keyPerms) {
      if (!currentPerms.has(flag) && simulated.has(flag)) {
        gained.push(`🔓 **${label}** — NEW`);
      }
    }

    const alreadyAdmin = currentPerms.has(PermissionsBitField.Flags.Administrator);
    const becomesAdmin = !alreadyAdmin && simulated.has(PermissionsBitField.Flags.Administrator);

    const lines = [
      `**🔮 Permission Simulation for ${member.displayName} + @${role.name}:**`,
      becomesAdmin ? '\n⚠️ **This role grants ADMINISTRATOR — full unrestricted access**' : '',
      `\n**Newly gained permissions (${gained.length}):**`,
      gained.length > 0 ? gained.join('\n') : '  • No new dangerous permissions gained',
      `\n**Role color:** ${role.hexColor} | **Role position:** ${role.position}`,
    ];

    return { success: true, message: lines.filter(Boolean).join('\n') };
  }
}
