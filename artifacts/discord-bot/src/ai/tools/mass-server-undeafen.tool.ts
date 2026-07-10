import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MassServerUndeafenTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'mass_server_undeafen',
    description: 'Removes server-deafen from all members in voice channels (or a specific channel).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Voice channel name or ID (optional)' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Undeafen all voice members', 'Remove deafen from everyone in Meeting'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const reason = String(params['reason'] ?? 'Mass server undeafen');
    const members = await guild.members.fetch();

    let targets = members.filter(m => !!m.voice.channelId && !!m.voice.serverDeaf);
    if (channelQuery) {
      const ch = guild.channels.cache.find(c => c.id === channelQuery || c.name.toLowerCase() === channelQuery);
      if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };
      targets = targets.filter(m => m.voice.channelId === ch.id);
    }

    if (targets.size === 0) return { success: true, message: 'No server-deafened voice members found.' };

    let success = 0; let failed = 0;
    for (const m of targets.values()) {
      try { await m.voice.setDeaf(false, reason); success++; } catch { failed++; }
    }

    return { success: true, message: `**Mass Server Undeafen:** ${success} undeafened, ${failed} failed` };
  }
}
