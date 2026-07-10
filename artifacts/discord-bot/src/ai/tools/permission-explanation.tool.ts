import { PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const PERM_EXPLANATIONS: Record<string, string> = {
  Administrator: 'Grants ALL permissions and bypasses channel-specific overrides. Treat like server owner access.',
  ManageGuild: 'Change server name, icon, region, verification level, and moderation settings.',
  ManageChannels: 'Create, edit, delete, and reorder channels and categories.',
  ManageRoles: 'Create, edit, delete roles BELOW their own highest role. Cannot grant perms they don\'t have.',
  ManageMessages: 'Delete and pin any message in the server. Required for moderation bots.',
  ManageWebhooks: 'Create and delete webhooks in channels — webhooks can post as any name/avatar.',
  KickMembers: 'Remove members from the server. They can rejoin with an invite.',
  BanMembers: 'Permanently ban members and delete their message history.',
  ModerateMembers: 'Timeout members (prevent them from sending messages/joining voice).',
  MentionEveryone: 'Use @everyone and @here to notify all/online members.',
  MoveMembers: 'Force-move members between voice channels.',
  MuteMembers: 'Server-mute members in voice channels.',
  DeafenMembers: 'Server-deafen members in voice channels.',
  ViewAuditLog: 'View the server\'s full audit log of admin actions.',
  ViewChannel: 'See a channel and its messages.',
  SendMessages: 'Post messages in text channels.',
  EmbedLinks: 'Auto-embed URLs as rich previews.',
  AttachFiles: 'Upload files and images.',
  ReadMessageHistory: 'Scroll back to see older messages.',
  Connect: 'Join voice channels.',
  Speak: 'Talk in voice channels (unmuted).',
  Stream: 'Share screen or camera in voice channels.',
  UseVAD: 'Use voice activity detection instead of push-to-talk.',
  PrioritySpeaker: 'Lower the volume of other speakers when talking.',
  CreateInstantInvite: 'Generate invite links to channels.',
  ChangeNickname: 'Change own nickname.',
  ManageNicknames: 'Change other members\' nicknames.',
  ManageEmojisAndStickers: 'Add, edit, delete custom emojis and stickers.',
  ManageEvents: 'Create, edit, delete scheduled events.',
  ManageThreads: 'Archive, delete, and rename threads.',
  SendMessagesInThreads: 'Post in threads.',
  UseApplicationCommands: 'Use slash commands from bots.',
  RequestToSpeak: 'Request to speak in Stage channels.',
  UseEmbeddedActivities: 'Use Discord activities (games) in voice channels.',
};

export class PermissionExplanationTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_explanation',
    description: 'Explains what a specific Discord permission does in plain English, or lists all permissions with explanations.',
    parameters: {
      type: 'object',
      properties: {
        permission: { type: 'string', description: 'Permission name to explain (e.g. "ManageMessages", "Administrator"). Leave blank to list all.' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Explain the ManageWebhooks permission', 'What does Administrator permission do?', 'List all permission explanations'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const permQuery = String(params['permission'] ?? '').trim();

    if (!permQuery) {
      const lines = Object.entries(PERM_EXPLANATIONS).slice(0, 15).map(([p, e]) => `**${p}** — ${e}`);
      return { success: true, message: `**📚 Discord Permissions Reference (top 15):**\n\n${lines.join('\n\n')}` };
    }

    // Try to find by name (case-insensitive)
    const key = Object.keys(PERM_EXPLANATIONS).find(k => k.toLowerCase() === permQuery.toLowerCase());
    if (key) {
      const val = PERM_EXPLANATIONS[key];
      return { success: true, message: `**🔑 ${key}:**\n${val}` };
    }

    // Try partial match
    const partials = Object.entries(PERM_EXPLANATIONS).filter(([k]) => k.toLowerCase().includes(permQuery.toLowerCase()));
    if (partials.length > 0) {
      const lines = partials.map(([p, e]) => `**${p}** — ${e}`);
      return { success: true, message: `**🔑 Permissions matching "${permQuery}":**\n\n${lines.join('\n\n')}` };
    }

    // Check if it's a valid flag name
    const allFlags = Object.keys(PermissionsBitField.Flags);
    const similar = allFlags.filter(f => f.toLowerCase().includes(permQuery.toLowerCase()));
    return { success: false, message: `Permission "${permQuery}" not found.\n${similar.length > 0 ? `Did you mean: ${similar.slice(0, 5).join(', ')}?` : 'Use permission_explanation without arguments to see all permissions.'}` };
  }
}
