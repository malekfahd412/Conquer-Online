import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getVerificationPanel, updateVerificationPanelConfig } from '../../discord/verification/verification-store';

export class ConfigureVerificationSettingsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configure_verification_settings',
    description: 'Updates settings for an existing verification panel: roles, method, account age check, cooldown, log channel.',
    parameters: {
      type: 'object',
      properties: {
        panelId: { type: 'string', description: 'The panel ID (from list_verification_panels)' },
        method: { type: 'string', description: 'Verification method', enum: ['button', 'rules', 'math', 'word', 'emoji', 'manual'] },
        verifiedRole: { type: 'string', description: 'Role to assign once verified (optional)' },
        unverifiedRole: { type: 'string', description: 'Role to remove once verified (optional)' },
        logChannel: { type: 'string', description: 'Channel for logs and manual approvals (optional)' },
        minAccountAgeDays: { type: 'number', description: 'Minimum account age in days (optional)' },
        cooldownSeconds: { type: 'number', description: 'Cooldown between attempts in seconds (optional)' },
      },
      required: ['panelId'],
    },
    dangerous: false,
    examples: ['Set verification cooldown to 60 seconds for vpanel_123', 'Change verification method to math for vpanel_123'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panelId = String(params['panelId'] ?? '');
    const panel = await getVerificationPanel(panelId);
    if (!panel || panel.guildId !== guild.id) return { success: false, message: `Panel "${panelId}" not found` };

    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();
    const patch: Record<string, unknown> = {};

    if (params['method']) patch.method = String(params['method']);
    if (params['verifiedRole']) {
      const q = String(params['verifiedRole']).toLowerCase();
      patch.verifiedRoleId = roles.find(r => r.id === q || r.name.toLowerCase() === q)?.id;
    }
    if (params['unverifiedRole']) {
      const q = String(params['unverifiedRole']).toLowerCase();
      patch.unverifiedRoleId = roles.find(r => r.id === q || r.name.toLowerCase() === q)?.id;
    }
    if (params['logChannel']) {
      const q = String(params['logChannel']).toLowerCase();
      patch.logChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
    }
    if (params['minAccountAgeDays'] !== undefined) patch.minAccountAgeDays = Number(params['minAccountAgeDays']);
    if (params['cooldownSeconds'] !== undefined) patch.cooldownSeconds = Number(params['cooldownSeconds']);

    await updateVerificationPanelConfig(panelId, patch);
    return { success: true, message: `⚙️ Verification panel \`${panelId}\` settings updated.` };
  }
}
