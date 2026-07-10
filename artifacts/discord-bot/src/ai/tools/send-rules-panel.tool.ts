import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendRulesPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_rules_panel',
    description: 'Sends a formatted server rules panel embed with optional "I Accept" button. Supports custom rules as a numbered list.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to post the rules panel in' },
        title: { type: 'string', description: 'Panel title (default: "📜 Server Rules")' },
        rules_json: {
          type: 'string',
          description: 'JSON array of rule strings. Example: ["Be respectful","No spam","Follow Discord ToS"]. Leave blank for a generic ruleset.',
        },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: gold)' },
        footer: { type: 'string', description: 'Footer text' },
        thumbnail_url: { type: 'string', description: 'Optional thumbnail URL' },
        show_accept_button: { type: 'string', description: 'Set to "true" to add an "I Accept the Rules" button' },
        show_invite: { type: 'string', description: 'Set to "true" to add a Discord invite link button (requires DISCORD_INVITE env var)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send rules panel to #rules', 'Create rules panel in #rules-and-info with custom rules and accept button'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0xf1c40f;

    let rules: string[];
    try {
      rules = params['rules_json'] ? JSON.parse(String(params['rules_json'])) : [
        'Treat all members with respect. No harassment, hate speech, or discrimination.',
        'No spam, excessive pinging, or flooding the chat.',
        'Keep content relevant to the channel\'s purpose.',
        'No NSFW content unless in designated channels.',
        'Follow Discord\'s Terms of Service and Community Guidelines.',
        'No advertising or self-promotion without permission.',
        'Listen to and respect staff decisions.',
      ];
      if (!Array.isArray(rules)) throw new Error('rules_json must be an array');
    } catch (err) {
      return { success: false, message: `Invalid rules_json: ${(err as Error).message}` };
    }

    const rulesText = rules.map((r, i) => `**${i + 1}.** ${r}`).join('\n\n');
    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '📜 Server Rules'))
      .setDescription(rulesText.slice(0, 4096))
      .setColor(color)
      .setFooter({ text: String(params['footer'] ?? `By being in ${guild.name}, you agree to these rules`) })
      .setTimestamp();

    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    const showAccept = String(params['show_accept_button'] ?? '').toLowerCase() === 'true';
    if (showAccept) {
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('accept_rules').setLabel('✅ I Accept the Rules').setStyle(ButtonStyle.Success),
      ));
    }

    const sent = await ch.send({ embeds: [embed], components });
    return {
      success: true,
      message: `✅ Rules panel sent to **#${ch.name}** with **${rules.length} rule(s)** (ID: \`${sent.id}\`)${showAccept ? '\n⚠️ Accept button requires an interaction handler to grant a role.' : ''}`,
      data: { messageId: sent.id },
    };
  }
}
