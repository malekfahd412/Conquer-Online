import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MassServerMuteTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'mass_server_mute',
    description: 'Server-mutes all members currently in voice channels (or a specific voice channel).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Voice channel name or ID (optional — leave blank to mute all voice members in the server)' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Mutes many members at once in voice channels.',
    examples: ['Server-mute everyone in the Meeting voice channel', 'Mute all voice members'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const reason = String(params['reason'] ?? 'Mass server mute');
    const members = await guild.members.fetch();

    let targets = members.filter(m => !!m.voice.channelId && !m.voice.serverMute);
    if (channelQuery) {
      const ch = guild.channels.cache.find(c => c.id === channelQuery || c.name.toLowerCase() === channelQuery);
      if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };
      targets = targets.filter(m => m.voice.channelId === ch.id);
    }

    if (targets.size === 0) return { success: true, message: 'No unmuted voice members found.' };

    let success = 0; let failed = 0;
    for (const m of targets.values()) {
      try { await m.voice.setMute(true, reason); success++; } catch { failed++; }
    }

    return { success: true, message: `**Mass Server Mute:** ${success} muted, ${failed} failed` };
  }
}
