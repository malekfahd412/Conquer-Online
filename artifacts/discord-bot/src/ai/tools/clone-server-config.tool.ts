import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneServerConfigTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_server_config',
    description: 'Exports the current server configuration settings (verification level, content filter, AFK settings, notifications) to a JSON file for documentation or transfer.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (default: server_config.json)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const filename = String(params['filename'] ?? 'server_config.json').replace(/\.\./g, '').replace(/\W+/g, '_').replace(/_json$/, '.json');
    const { promises: fs } = await import('fs');
    const path = await import('path');

    const config = {
      exportedAt: new Date().toISOString(),
      guild: {
        name: guild.name, description: guild.description, icon: guild.icon,
        banner: guild.banner, splash: guild.splash,
        verificationLevel: guild.verificationLevel,
        defaultMessageNotifications: guild.defaultMessageNotifications,
        explicitContentFilter: guild.explicitContentFilter,
        mfaLevel: guild.mfaLevel,
        afkTimeout: guild.afkTimeout, afkChannelId: guild.afkChannelId,
        systemChannelId: guild.systemChannelId,
        preferredLocale: guild.preferredLocale,
        premiumTier: guild.premiumTier,
        features: guild.features,
        ownerId: guild.ownerId,
      },
    };

    const filePath = path.join(process.cwd(), 'data', filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');

    return {
      success: true,
      message: `✅ Server configuration exported to \`data/${filename}\`\n` +
        `Verification: ${guild.verificationLevel} | MFA: ${guild.mfaLevel} | Locale: ${guild.preferredLocale}\n` +
        `⚠️ **Discord API limitation:** Configuration cannot be directly applied to another server via the API.`,
      data: { filePath },
    };
  }
}
