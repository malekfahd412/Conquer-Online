import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MassServerDeafenTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'mass_server_deafen',
    description: 'Server-deafens all members currently in voice channels (or a specific channel).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Voice channel name or ID (optional)' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Deafens many members at once in voice channels.',
    examples: ['Deafen all voice members', 'Server-deafen everyone in Stage channel'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const reason = String(params['reason'] ?? 'Mass server deafen');
    const members = await guild.members.fetch();

    let targets = members.filter(m => !!m.voice.channelId && !m.voice.serverDeaf);
    if (channelQuery) {
      const ch = guild.channels.cache.find(c => c.id === channelQuery || c.name.toLowerCase() === channelQuery);
      if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };
      targets = targets.filter(m => m.voice.channelId === ch.id);
    }

    if (targets.size === 0) return { success: true, message: 'No un-deafened voice members found.' };

    let success = 0; let failed = 0;
    for (const m of targets.values()) {
      try { await m.voice.setDeaf(true, reason); success++; } catch { failed++; }
    }

    return { success: true, message: `**Mass Server Deafen:** ${success} deafened, ${failed} failed` };
  }
}
