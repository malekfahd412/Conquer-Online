import {
  ActionRowBuilder, RoleSelectMenuBuilder, EmbedBuilder, ChannelType,
} from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { parseColor, resolveThemeColor } from './embed-themes';

export class SendRoleSelectTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_role_select',
    description: 'Sends a message with a role select menu — users can pick one or more server roles from a Discord-native dropdown.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        placeholder: { type: 'string', description: 'Placeholder text' },
        min_values: { type: 'string', description: 'Minimum roles to select (default: 1)' },
        max_values: { type: 'string', description: 'Maximum roles to select (default: 1)' },
        embed_title: { type: 'string', description: 'Optional embed title' },
        embed_description: { type: 'string', description: 'Optional embed description' },
        embed_color: { type: 'string', description: 'Embed color (hex or theme name)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send a role select menu to #role-picker so members can choose their roles'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const minValues = Math.max(0, parseInt(String(params['min_values'] ?? '1')) || 1);
    const maxValues = Math.min(25, Math.max(1, parseInt(String(params['max_values'] ?? '1')) || 1));

    const select = new RoleSelectMenuBuilder()
      .setCustomId(`role_select_${Date.now()}`)
      .setPlaceholder(String(params['placeholder'] ?? 'Select a role'))
      .setMinValues(minValues)
      .setMaxValues(maxValues);

    const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select);
    const payload: Record<string, unknown> = { components: [row] };

    if (params['embed_title'] || params['embed_description']) {
      const colorInput = String(params['embed_color'] ?? '').trim();
      const color = colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput || 'modern');
      const embed = new EmbedBuilder().setColor(color);
      if (params['embed_title']) embed.setTitle(String(params['embed_title']).slice(0, 256));
      if (params['embed_description']) embed.setDescription(String(params['embed_description']).slice(0, 4096));
      payload['embeds'] = [embed];
    }

    const sent = await ch.send(payload as Parameters<TextChannel['send']>[0]);
    return {
      success: true,
      message: `✅ Role select menu sent to **#${ch.name}** (message ID: \`${sent.id}\`)\n⚠️ Requires an interaction handler to assign roles on selection.`,
      data: { messageId: sent.id },
    };
  }
}
