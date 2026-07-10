import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UndeafenVoiceMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'undeafen_voice_member',
    description: 'Removes the server-deafen from a member in voice, allowing them to hear again.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to undeafen' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Undeafen PlayerOne in voice', 'Let DragonSlayer hear again'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim().toLowerCase();
    const members = await guild.members.fetch();
    const member = members.find(
      m => m.user.username.toLowerCase() === username ||
        m.displayName.toLowerCase() === username ||
        m.user.tag.toLowerCase() === username,
    );

    if (!member) return { success: false, message: `Member "${params['username']}" not found` };
    if (!member.voice.channelId) return { success: false, message: `${member.user.tag} is not in a voice channel` };
    if (!member.voice.serverDeaf) return { success: false, message: `${member.user.tag} is not server-deafened` };

    await member.voice.setDeaf(false);
    return { success: true, message: `🔔 Undeafened **${member.user.tag}** — they can hear again` };
  }
}
