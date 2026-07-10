import { PermissionsBitField } from 'discord.js';
import type { Guild, Role } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const PERMISSION_MAP: Record<string, bigint> = {
  administrator: PermissionsBitField.Flags.Administrator,
  manage_guild: PermissionsBitField.Flags.ManageGuild,
  manage_channels: PermissionsBitField.Flags.ManageChannels,
  manage_roles: PermissionsBitField.Flags.ManageRoles,
  manage_messages: PermissionsBitField.Flags.ManageMessages,
  manage_nicknames: PermissionsBitField.Flags.ManageNicknames,
  manage_webhooks: PermissionsBitField.Flags.ManageWebhooks,
  manage_events: PermissionsBitField.Flags.ManageEvents,
  kick_members: PermissionsBitField.Flags.KickMembers,
  ban_members: PermissionsBitField.Flags.BanMembers,
  moderate_members: PermissionsBitField.Flags.ModerateMembers,
  send_messages: PermissionsBitField.Flags.SendMessages,
  read_messages: PermissionsBitField.Flags.ViewChannel,
  view_channel: PermissionsBitField.Flags.ViewChannel,
  embed_links: PermissionsBitField.Flags.EmbedLinks,
  attach_files: PermissionsBitField.Flags.AttachFiles,
  add_reactions: PermissionsBitField.Flags.AddReactions,
  use_external_emojis: PermissionsBitField.Flags.UseExternalEmojis,
  mention_everyone: PermissionsBitField.Flags.MentionEveryone,
  connect: PermissionsBitField.Flags.Connect,
  speak: PermissionsBitField.Flags.Speak,
  mute_members: PermissionsBitField.Flags.MuteMembers,
  deafen_members: PermissionsBitField.Flags.DeafenMembers,
  move_members: PermissionsBitField.Flags.MoveMembers,
  create_instant_invite: PermissionsBitField.Flags.CreateInstantInvite,
  change_nickname: PermissionsBitField.Flags.ChangeNickname,
  read_message_history: PermissionsBitField.Flags.ReadMessageHistory,
};

export class SetRolePermissionsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_role_permissions',
    description: 'Sets the permissions for a role. Provide a comma-separated list of permission names to grant. All other permissions are removed.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the role' },
        permissions: {
          type: 'string',
          description: 'Comma-separated list of permissions to grant. Available: administrator, manage_guild, manage_channels, manage_roles, manage_messages, kick_members, ban_members, moderate_members, send_messages, view_channel, connect, speak, move_members, read_message_history, etc.',
        },
      },
      required: ['name', 'permissions'],
    },
    dangerous: true,
    dangerDescription: 'Changes role permissions for all members who hold this role.',
    examples: ['Give Moderator role: manage_messages, kick_members, moderate_members', 'Set Member role to: send_messages, view_channel, connect, speak'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name) as Role | undefined;
    if (!role) return { success: false, message: `Role "${params['name']}" not found` };

    const permList = String(params['permissions'] ?? '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    if (permList.length === 0) return { success: false, message: 'At least one permission is required' };

    const unknown = permList.filter(p => !PERMISSION_MAP[p]);
    if (unknown.length > 0) {
      return { success: false, message: `Unknown permission(s): ${unknown.join(', ')}. Valid: ${Object.keys(PERMISSION_MAP).join(', ')}` };
    }

    const bits = permList.reduce((acc, p) => acc | PERMISSION_MAP[p]!, BigInt(0));
    await role.setPermissions(new PermissionsBitField(bits));

    return {
      success: true,
      message: `Updated permissions for **@${role.name}**:\n• Granted: ${permList.join(', ')}`,
    };
  }
}
