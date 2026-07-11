import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getVerificationPanels } from '../../discord/verification/verification-store';

export class ListVerificationPanelsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_verification_panels',
    description: 'Lists all configured verification panels for this server.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['List verification panels'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panels = await getVerificationPanels(guild.id);
    if (panels.length === 0) return { success: true, message: 'No verification panels configured yet.' };
    const lines = panels.map(p => `• \`${p.id}\` — **${p.title}** in <#${p.channelId}> — method: ${p.method} — role: <@&${p.verifiedRoleId}>`);
    return { success: true, message: `✅ **Verification Panels (${panels.length})**\n${lines.join('\n')}` };
  }
}
