import { GuildVerificationLevel, GuildExplicitContentFilter, ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SecurityReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'security_report',
    description: 'Generates a comprehensive security assessment of the server: verification level, 2FA requirement, content filters, dangerous permissions, public roles, and vulnerability flags.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const issues: Array<{ severity: 'critical' | 'high' | 'medium' | 'low'; message: string }> = [];
    const strengths: string[] = [];

    // Verification level
    const verLevel = guild.verificationLevel;
    const verNames = ['None', 'Low', 'Medium', 'High', 'Very High'];
    if (verLevel === GuildVerificationLevel.None) issues.push({ severity: 'critical', message: 'Verification level is **None** — anyone can join and message immediately' });
    else if (verLevel === GuildVerificationLevel.Low) issues.push({ severity: 'medium', message: 'Verification level is **Low** — requires only verified email' });
    else strengths.push(`✅ Verification level: **${verNames[verLevel]}**`);

    // MFA requirement
    if (guild.mfaLevel === 0) issues.push({ severity: 'high', message: 'MFA/2FA for moderators is **not required** — enable under Server Settings > Safety' });
    else strengths.push('✅ 2FA required for moderators');

    // Explicit content filter
    if (guild.explicitContentFilter === GuildExplicitContentFilter.Disabled) issues.push({ severity: 'high', message: 'Explicit content filter is **disabled** — NSFW images can be shared' });
    else if (guild.explicitContentFilter === GuildExplicitContentFilter.MembersWithoutRoles) issues.push({ severity: 'medium', message: 'Explicit content filter only applies to **members without roles**' });
    else strengths.push('✅ Explicit content filter covers all members');

    // Admin roles
    const adminRoles = guild.roles.cache.filter(r =>
      r.permissions.has('Administrator') && !r.managed && r.id !== guild.id
    );
    if (adminRoles.size > 3) issues.push({ severity: 'medium', message: `**${adminRoles.size} roles** have Administrator permission — review if all are necessary` });
    else if (adminRoles.size > 0) strengths.push(`✅ ${adminRoles.size} administrator role(s)`);

    // @everyone dangerous permissions
    const everyonePerms = guild.roles.everyone.permissions;
    const dangerousPerms = ['ManageMessages', 'MentionEveryone', 'ManageChannels', 'ManageRoles', 'ManageWebhooks'] as const;
    for (const perm of dangerousPerms) {
      if (everyonePerms.has(perm)) issues.push({ severity: 'high', message: `@everyone has **${perm}** permission — this applies to all members` });
    }

    // NSFW channels
    const nsfwChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && 'nsfw' in c && c.nsfw);
    if (nsfwChannels.size > 0 && verLevel < GuildVerificationLevel.Medium) {
      issues.push({ severity: 'medium', message: `${nsfwChannels.size} NSFW channel(s) with low verification level` });
    }

    // Vanity URL / community
    if (guild.features.includes('COMMUNITY')) strengths.push('✅ Community features enabled');

    // Bans check
    let banCount = 0;
    try { banCount = (await guild.bans.fetch({ limit: 1000 })).size; } catch { banCount = 0; }

    const critCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const medCount = issues.filter(i => i.severity === 'medium').length;

    const scoreBase = 100 - (critCount * 30) - (highCount * 15) - (medCount * 5);
    const score = Math.max(0, Math.min(100, scoreBase));
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

    const lines = [
      `🔒 **Security Report** — **${guild.name}**`,
      `**Security Score: ${score}/100 (Grade ${grade})**`,
      `Members: ${guild.memberCount} | Bans: ${banCount} | Verification: ${verNames[verLevel]}`,
      '',
    ];

    if (issues.length === 0) {
      lines.push('🎉 No security issues detected!');
    } else {
      const byLevel = [
        ...issues.filter(i => i.severity === 'critical').map(i => `🔴 **CRITICAL:** ${i.message}`),
        ...issues.filter(i => i.severity === 'high').map(i => `🟠 **HIGH:** ${i.message}`),
        ...issues.filter(i => i.severity === 'medium').map(i => `🟡 **MEDIUM:** ${i.message}`),
        ...issues.filter(i => i.severity === 'low').map(i => `🟢 **LOW:** ${i.message}`),
      ];
      lines.push(`**Issues (${issues.length}):**`);
      lines.push(...byLevel);
    }

    if (strengths.length) { lines.push(''); lines.push('**Strengths:**'); lines.push(...strengths); }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
