import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendReactionRolesPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_reaction_roles_panel',
    description: 'Sends a role selection panel where members can self-assign roles by clicking buttons. Each role becomes a button. Interaction handlers are required to actually assign/remove roles.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to post the role panel in' },
        title: { type: 'string', description: 'Panel title (default: "🎭 Role Selection")' },
        description: { type: 'string', description: 'Panel description' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: modern)' },
        roles_json: {
          type: 'string',
          description: 'JSON array of role buttons. Each: {label, emoji?, style?, roleId?}. Example: [{"label":"🎮 Gamer","emoji":"🎮","style":"primary"},{"label":"🎵 Music Fan","style":"secondary"}]',
        },
        footer: { type: 'string', description: 'Footer text' },
        thumbnail_url: { type: 'string', description: 'Optional thumbnail URL' },
        allow_multiple: { type: 'string', description: 'Set to "false" to indicate only one role can be selected (displayed in description)' },
      },
      required: ['channel', 'roles_json'],
    },
    dangerous: false,
    examples: ['Send a reaction roles panel to #roles with Gaming, Music, and Art role buttons'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let roles: Array<{ label: string; emoji?: string; style?: string; roleId?: string }>;
    try {
      roles = JSON.parse(String(params['roles_json'] ?? '[]'));
      if (!Array.isArray(roles) || roles.length === 0) throw new Error('At least one role required');
      if (roles.length > 25) return { success: false, message: 'Maximum 25 roles in a role panel' };
    } catch (err) {
      return { success: false, message: `Invalid roles_json: ${(err as Error).message}` };
    }

    const allowMultiple = String(params['allow_multiple'] ?? 'true').toLowerCase() !== 'false';
    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x5865f2;

    const defaultDescription = `Pick ${allowMultiple ? 'one or more roles' : 'a role'} from the options below to customize your experience in **${guild.name}**.\n\nClick a button to add or remove the role.`;

    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '🎭 Role Selection'))
      .setDescription(String(params['description'] ?? defaultDescription).slice(0, 4096))
      .setColor(color)
      .setFooter({ text: String(params['footer'] ?? `${roles.length} role(s) available`) })
      .setTimestamp();

    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));

    const styleMap: Record<string, ButtonStyle> = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < roles.length; i += 5) {
      const chunk = roles.slice(i, i + 5);
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const r of chunk) {
        const btn = new ButtonBuilder()
          .setCustomId(`role_toggle_${(r.roleId ?? r.label.replace(/\W+/g, '_').toLowerCase()).slice(0, 80)}`)
          .setLabel(r.label)
          .setStyle(styleMap[r.style?.toLowerCase() ?? ''] ?? ButtonStyle.Primary);
        if (r.emoji) btn.setEmoji(r.emoji);
        row.addComponents(btn);
      }
      rows.push(row);
    }

    const sent = await ch.send({ embeds: [embed], components: rows });
    return {
      success: true,
      message: `✅ Role selection panel sent to **#${ch.name}** with **${roles.length} role button(s)** (ID: \`${sent.id}\`)\n⚠️ Role assignment/removal requires interaction handlers for the buttons.`,
      data: { messageId: sent.id },
    };
  }
}
