import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { createVerificationPanel } from '../../discord/verification/verification-store';
import { verificationService } from '../../discord/verification/verification.service';

export class CreateVerificationPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_verification_panel',
    description: 'Creates a verification panel with a chosen method: button, rules, math, word, emoji, or manual staff approval.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to post the panel in' },
        title: { type: 'string', description: 'Panel embed title' },
        description: { type: 'string', description: 'Panel embed description' },
        method: { type: 'string', description: 'Verification method', enum: ['button', 'rules', 'math', 'word', 'emoji', 'manual'] },
        verifiedRole: { type: 'string', description: 'Role to assign once verified' },
        unverifiedRole: { type: 'string', description: 'Role to remove once verified (optional)' },
        welcomeRole: { type: 'string', description: 'Additional role to grant on verification (optional)' },
        logChannel: { type: 'string', description: 'Channel for verification logs and manual approval requests (optional)' },
        minAccountAgeDays: { type: 'number', description: 'Minimum Discord account age in days to allow verification (optional, default 0)' },
        cooldownSeconds: { type: 'number', description: 'Cooldown between verification attempts in seconds (optional, default 30)' },
      },
      required: ['channel', 'title', 'description', 'method', 'verifiedRole'],
    },
    dangerous: false,
    examples: ['Create a math verification panel in #verify granting the Member role', 'Set up manual staff approval verification'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const channels = await guild.channels.fetch();
    const channel = channels.find(c => c && (c.id === channelQuery || c.name.toLowerCase() === channelQuery));
    if (!channel) return { success: false, message: `Channel "${params['channel']}" not found` };

    const roles = await guild.roles.fetch();
    const findRole = (q?: unknown) => {
      if (!q) return undefined;
      const query = String(q).toLowerCase();
      return roles.find(r => r.id === query || r.name.toLowerCase() === query)?.id;
    };

    const verifiedRoleId = findRole(params['verifiedRole']);
    if (!verifiedRoleId) return { success: false, message: `Verified role "${params['verifiedRole']}" not found` };

    const method = String(params['method'] ?? 'button') as 'button' | 'rules' | 'math' | 'word' | 'emoji' | 'manual';
    let logChannelId: string | undefined;
    if (params['logChannel']) {
      const q = String(params['logChannel']).toLowerCase();
      logChannelId = channels.find(c => c && (c.id === q || c.name.toLowerCase() === q))?.id;
    }

    const panel = await createVerificationPanel({
      guildId: guild.id,
      channelId: channel.id,
      title: String(params['title']),
      description: String(params['description']),
      color: 0x57f287,
      method,
      verifiedRoleId,
      unverifiedRoleId: findRole(params['unverifiedRole']),
      welcomeRoleId: findRole(params['welcomeRole']),
      logChannelId,
      minAccountAgeDays: Number(params['minAccountAgeDays'] ?? 0),
      cooldownSeconds: Number(params['cooldownSeconds'] ?? 30),
    });

    await verificationService.postPanel(guild, panel);

    return {
      success: true,
      message: `✅ **Verification panel created** in <#${channel.id}>\n• Panel ID: \`${panel.id}\`\n• Method: ${method}\n• Verified role: <@&${verifiedRoleId}>`,
    };
  }
}
