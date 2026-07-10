import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class GenerateConfigDocsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'generate_config_docs',
    description: 'Generates a comprehensive configuration documentation report for the server, covering system channels, moderation settings, community features, safety filters, widget config, and bot integrations.',
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Optional channel name to post the documentation. If omitted, returns it as a response.',
        },
      },
      required: [],
    },
    dangerous: false,
    examples: ['generate config docs', 'document server configuration', 'generate configuration documentation'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    await guild.fetch();

    const systemChannel = guild.systemChannel;
    const rulesChannel = guild.rulesChannel;
    const publicUpdatesChannel = guild.publicUpdatesChannel;
    const safetyAlertsChannel = guild.safetyAlertsChannel;

    const lines: string[] = [
      `⚙️ **Configuration Documentation** — **${guild.name}**`,
      `_Generated: ${new Date().toUTCString()}_`,
      '',
      '## 🏛️ Server Identity',
      `**Name:** ${guild.name}`,
      `**ID:** ${guild.id}`,
      `**Owner:** <@${guild.ownerId}>`,
      `**Description:** ${guild.description ?? '_None_'}`,
      `**Locale:** ${guild.preferredLocale}`,
      `**Verification Level:** ${guild.verificationLevel}`,
      `**Explicit Content Filter:** ${guild.explicitContentFilter}`,
      `**Default Notifications:** ${guild.defaultMessageNotifications}`,
      `**2FA Requirement:** ${guild.mfaLevel === 1 ? 'Required for moderators' : 'Not required'}`,
      '',
      '## 📢 System Channels',
      `**System Channel:** ${systemChannel ? `#${systemChannel.name}` : '_Not set_'}`,
      `**Rules Channel:** ${rulesChannel ? `#${rulesChannel.name}` : '_Not set_'}`,
      `**Public Updates Channel:** ${publicUpdatesChannel ? `#${publicUpdatesChannel.name}` : '_Not set_'}`,
      `**Safety Alerts Channel:** ${safetyAlertsChannel ? `#${safetyAlertsChannel.name}` : '_Not set_'}`,
      '',
      '## ✨ Features & Community',
      ...guild.features.map(f => `  • ${f}`),
      guild.features.length === 0 ? '  _No special features enabled_' : '',
      '',
      '## 🔢 Resource Counts',
      `**Members:** ${guild.memberCount}`,
      `**Channels:** ${guild.channels.cache.size}`,
      `**Roles:** ${guild.roles.cache.size}`,
      `**Emojis:** ${guild.emojis.cache.size}`,
      `**Stickers:** ${guild.stickers.cache.size}`,
      `**Boost Level:** ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
      '',
      '## 🤖 Bot Integrations',
      `Bots in server: ${guild.members.cache.filter(m => m.user.bot).size}`,
      '',
      '## ⚠️ Discord API Limitations',
      '- AutoMod rules, onboarding prompts, and safety filter details require separate fetch calls.',
      '- Widget URL and invite splash require guild features to be configured first.',
    ];

    const doc = lines.filter(l => l !== null).join('\n').slice(0, 4000);

    const channelName = params['channel'] ? String(params['channel']).toLowerCase() : null;
    if (channelName) {
      const target = guild.channels.cache.find(
        c => c.name.toLowerCase() === channelName && c.isTextBased()
      ) as TextChannel | undefined;
      if (!target) return { success: false, message: `Channel #${channelName} not found.` };
      await target.send({ content: doc });
      return { success: true, message: `Configuration documentation posted to #${target.name}.` };
    }

    return { success: true, message: doc };
  }
}
