import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { removeWarning } from './moderation-store';

export class RemoveWarningTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'remove_warning',
    description: 'Removes a specific warning from a member by warning ID. Use warnings_history to find IDs.',
    parameters: {
      type: 'object',
      properties: {
        warning_id: { type: 'string', description: 'The warning ID to remove (from warnings_history)' },
      },
      required: ['warning_id'],
    },
    dangerous: false,
    examples: ['Remove warning w_123456_abc', 'Delete warning ID w_1720000000000_xyz'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const warningId = String(params['warning_id'] ?? '').trim();
    if (!warningId) return { success: false, message: 'Warning ID is required' };

    const removed = await removeWarning(guild.id, warningId);
    if (!removed) return { success: false, message: `Warning \`${warningId}\` not found in this server` };

    return { success: true, message: `✅ Warning \`${warningId}\` has been removed` };
  }
}
