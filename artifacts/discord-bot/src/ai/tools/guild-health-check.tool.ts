import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class GuildHealthCheckTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'guild_health_check',
    description: 'Runs a health check on the server and reports potential issues: empty categories, unverified settings, missing safety features, excessive roles, etc.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
    examples: ['Run a server health check', 'Check if the server has any issues', 'Optimize server suggestions'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const issues: string[] = [];
    const ok: string[] = [];

    // verificationLevel: 0 = None
    if (guild.verificationLevel === 0) {
      issues.push('⚠️ Verification level is **None** — consider setting it to Low or higher');
    } else {
      ok.push('✅ Verification level is configured');
    }

    // explicitContentFilter: 0 = Disabled
    if (guild.explicitContentFilter === 0) {
      issues.push('⚠️ Explicit content filter is **Disabled** — consider enabling it');
    } else {
      ok.push('✅ Explicit content filter is active');
    }

    // Empty categories
    const emptyCategories = guild.channels.cache.filter(c => {
      if (c.type !== ChannelType.GuildCategory) return false;
      const children = guild.channels.cache.filter(ch => (ch as { parentId?: string | null }).parentId === c.id);
      return children.size === 0;
    });
    if (emptyCategories.size > 0) {
      issues.push(`⚠️ ${emptyCategories.size} empty categor${emptyCategories.size === 1 ? 'y' : 'ies'}: ${emptyCategories.map(c => c.name).join(', ')}`);
    } else {
      ok.push('✅ No empty categories');
    }

    // Role count
    const roleCount = guild.roles.cache.size - 1;
    if (roleCount > 50) {
      issues.push(`⚠️ ${roleCount} roles — consider cleaning up unused roles`);
    } else {
      ok.push(`✅ Role count is healthy (${roleCount})`);
    }

    // Boost level: 0 = None
    if (guild.premiumTier === 0) {
      issues.push('ℹ️ No boost level — boosting unlocks higher bitrate, file size limits, and banner');
    } else {
      ok.push(`✅ Boost level ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)`);
    }

    // AFK channel
    if (!guild.afkChannelId) {
      issues.push('ℹ️ No AFK channel configured — idle members will stay in active channels');
    } else {
      ok.push('✅ AFK channel is configured');
    }

    const allLines = [
      `**🏥 Server Health Check — ${guild.name}**`,
      '',
      ...ok,
      ...(issues.length > 0 ? ['', '**Issues & Suggestions:**', ...issues] : ['', '🎉 No issues found!']),
    ];

    return { success: true, message: allLines.join('\n') };
  }
}
