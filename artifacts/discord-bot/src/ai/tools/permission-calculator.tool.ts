import { PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionCalculatorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_calculator',
    description: 'Calculates the effective permissions of a member in the server or a specific channel, listing what they can and cannot do.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
        channel: { type: 'string', description: 'Channel name or ID (optional — omit for server-wide permissions)' },
      },
      required: ['user'],
    },
    dangerous: false,
    examples: ['Calculate permissions for JohnDoe in #general', 'What can the Moderator role do?', 'Show permissions for user 123456789'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();

    const members = await guild.members.fetch();
    const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };

    let perms: Readonly<PermissionsBitField>;
    let context = 'Server-wide';

    if (chQuery) {
      const ch = guild.channels.cache.find(c => c.id === chQuery || ('name' in c && (c.name as string).toLowerCase() === chQuery));
      if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };
      if (!('permissionsFor' in ch)) return { success: false, message: 'Cannot calculate permissions for this channel type' };
      const chTyped = ch as { permissionsFor(m: typeof member): Readonly<PermissionsBitField> | null; name?: string; id: string };
      const p = chTyped.permissionsFor(member);
      if (!p) return { success: false, message: 'Could not compute permissions' };
      perms = p;
      context = `#${chTyped.name ?? ch.id}`;
    } else {
      perms = member.permissions;
    }

    const keyPerms: [string, bigint][] = [
      ['Administrator', PermissionsBitField.Flags.Administrator],
      ['Manage Server', PermissionsBitField.Flags.ManageGuild],
      ['Manage Channels', PermissionsBitField.Flags.ManageChannels],
      ['Manage Roles', PermissionsBitField.Flags.ManageRoles],
      ['Manage Messages', PermissionsBitField.Flags.ManageMessages],
      ['Manage Webhooks', PermissionsBitField.Flags.ManageWebhooks],
      ['Kick Members', PermissionsBitField.Flags.KickMembers],
      ['Ban Members', PermissionsBitField.Flags.BanMembers],
      ['Mention Everyone', PermissionsBitField.Flags.MentionEveryone],
      ['Send Messages', PermissionsBitField.Flags.SendMessages],
      ['Embed Links', PermissionsBitField.Flags.EmbedLinks],
      ['Attach Files', PermissionsBitField.Flags.AttachFiles],
      ['Read Message History', PermissionsBitField.Flags.ReadMessageHistory],
      ['View Channels', PermissionsBitField.Flags.ViewChannel],
      ['Connect (Voice)', PermissionsBitField.Flags.Connect],
      ['Speak (Voice)', PermissionsBitField.Flags.Speak],
      ['Mute Members', PermissionsBitField.Flags.MuteMembers],
      ['Deafen Members', PermissionsBitField.Flags.DeafenMembers],
      ['Move Members', PermissionsBitField.Flags.MoveMembers],
      ['Moderate Members', PermissionsBitField.Flags.ModerateMembers],
    ];

    const allowed: string[] = [];
    const denied: string[] = [];

    for (const [label, flag] of keyPerms) {
      if (perms.has(flag)) allowed.push(`✅ ${label}`);
      else denied.push(`❌ ${label}`);
    }

    return {
      success: true,
      message: [
        `**🔑 Permissions for ${member.displayName} in ${context}:**`,
        '',
        ...allowed,
        '',
        ...denied,
      ].join('\n'),
    };
  }
}
