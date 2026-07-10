import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ClonePermissionsStructureTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_permissions_structure',
    description: 'Copies permission overwrites from one channel to another channel of the same type. Useful for setting up consistent permission patterns.',
    parameters: {
      type: 'object',
      properties: {
        source_channel: { type: 'string', description: 'Source channel name or ID (permission template)' },
        target_channel: { type: 'string', description: 'Target channel name or ID to apply permissions to' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['source_channel', 'target_channel', 'confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: 'Cloning permissions requires `confirm: "CONFIRM"`' };
    }
    const srcQuery = String(params['source_channel'] ?? '').toLowerCase().trim();
    const tgtQuery = String(params['target_channel'] ?? '').toLowerCase().trim();

    const src = guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.id === srcQuery || c.name.toLowerCase() === srcQuery)) as TextChannel | undefined;
    const tgt = guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.id === tgtQuery || c.name.toLowerCase() === tgtQuery)) as TextChannel | undefined;

    if (!src) return { success: false, message: `Source channel "${params['source_channel']}" not found` };
    if (!tgt) return { success: false, message: `Target channel "${params['target_channel']}" not found` };

    const overwrites = src.permissionOverwrites.cache;
    let applied = 0;

    for (const [id, ow] of overwrites) {
      try {
        await tgt.permissionOverwrites.edit(id, ow as never, { reason: `Clone permissions from #${src.name}` });
        applied++;
      } catch { /* skip inaccessible role/user */ }
    }

    return {
      success: true,
      message: `✅ Copied **${applied}** permission overwrite(s) from **#${src.name}** to **#${tgt.name}**`,
    };
  }
}
