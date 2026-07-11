import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { deleteVerificationPanel, getVerificationPanel } from '../../discord/verification/verification-store';

export class DeleteVerificationPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_verification_panel',
    description: 'Deletes a verification panel configuration by ID.',
    parameters: {
      type: 'object',
      properties: { panelId: { type: 'string', description: 'The panel ID (from list_verification_panels)' } },
      required: ['panelId'],
    },
    dangerous: true,
    dangerDescription: 'Removes the panel configuration. The posted panel message will stop working.',
    examples: ['Delete verification panel vpanel_123'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panelId = String(params['panelId'] ?? '');
    const panel = await getVerificationPanel(panelId);
    if (!panel || panel.guildId !== guild.id) return { success: false, message: `Panel "${panelId}" not found` };
    await deleteVerificationPanel(panelId);
    return { success: true, message: `🗑️ Verification panel \`${panelId}\` deleted.` };
  }
}
