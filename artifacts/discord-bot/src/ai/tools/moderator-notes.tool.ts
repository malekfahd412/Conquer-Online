import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { addNote, getNotes } from './moderation-store';

export class ModeratorNotesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'moderator_notes',
    description: 'Adds or shows private moderator notes on a member. Notes are only visible to moderators via this tool.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
        note: { type: 'string', description: 'Note content to add. Leave blank to VIEW existing notes.' },
        moderator: { type: 'string', description: 'Moderator username or ID (optional, for attribution)' },
      },
      required: ['user'],
    },
    dangerous: false,
    examples: ['Add note to JohnDoe: previously warned for harassment', 'Show notes for ToxicUser'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const noteContent = String(params['note'] ?? '').trim();

    const members = await guild.members.fetch();
    const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };

    if (!noteContent) {
      const notes = await getNotes(guild.id, member.id);
      if (notes.length === 0) return { success: true, message: `No notes found for **${member.displayName}**` };
      const lines = notes.map(n => `• \`${n.id}\` — ${n.content} — <t:${Math.floor(n.timestamp / 1000)}:R>`);
      return { success: true, message: `**📝 Notes for ${member.displayName} (${notes.length}):**\n${lines.join('\n')}` };
    }

    const modQuery = String(params['moderator'] ?? '').toLowerCase().trim();
    const mod = modQuery ? members.find(m => m.id === modQuery || m.user.username.toLowerCase() === modQuery) : null;

    const note = await addNote({ userId: member.id, guildId: guild.id, content: noteContent, moderatorId: mod?.id ?? 'system' });
    return { success: true, message: `📝 Note added to **${member.displayName}**\n• ID: \`${note.id}\`\n• Content: ${noteContent}` };
  }
}
