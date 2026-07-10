import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, RoleSelectMenuBuilder,
  UserSelectMenuBuilder, ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder, ChannelType,
} from 'discord.js';
import type { Guild, TextChannel, AnyComponentBuilder } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getComponentTemplate } from './component-store';
import type { ButtonConfig, SelectConfig } from './component-store';

const STYLE_MAP: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
  link: ButtonStyle.Link,
};

export class LoadComponentTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'load_component_template',
    description: 'Loads a saved component template and sends it to a channel.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name to load' },
        channel: { type: 'string', description: 'Channel name or ID to send to' },
        content_override: { type: 'string', description: 'Override the template\'s message text' },
      },
      required: ['name', 'channel'],
    },
    dangerous: false,
    examples: ['Load component template "verify-buttons" and send it to #verify'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();

    const template = await getComponentTemplate(name);
    if (!template) return { success: false, message: `Template "${name}" not found. Use \`list_component_templates\` to see available templates.` };

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const content = params['content_override'] ? String(params['content_override']) : template.content;
    const rows: ActionRowBuilder<AnyComponentBuilder>[] = [];

    if (template.type === 'button' && template.rows) {
      for (const rowDefs of template.rows) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (const [i, def] of rowDefs.entries()) {
          const d = def as ButtonConfig;
          const style = STYLE_MAP[d.style?.toLowerCase()] ?? ButtonStyle.Primary;
          const btn = new ButtonBuilder().setLabel(d.label).setStyle(style);
          if (style === ButtonStyle.Link && d.url) btn.setURL(d.url);
          else btn.setCustomId(d.customId ?? `btn_${i}_${Date.now()}`);
          if (d.emoji) btn.setEmoji(d.emoji);
          if (d.disabled) btn.setDisabled(true);
          row.addComponents(btn);
        }
        rows.push(row as ActionRowBuilder<AnyComponentBuilder>);
      }
    } else if (template.component) {
      const def = template.component as SelectConfig;
      switch (template.type) {
        case 'string_select': {
          const s = new StringSelectMenuBuilder()
            .setCustomId(def.customId ?? `sel_${Date.now()}`)
            .setPlaceholder(def.placeholder ?? 'Select an option')
            .setMinValues(def.minValues ?? 1).setMaxValues(def.maxValues ?? 1);
          if (def.options) s.addOptions(def.options.map(o => ({ label: o.label, value: o.value, description: o.description, emoji: o.emoji, default: o.default })));
          rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(s) as ActionRowBuilder<AnyComponentBuilder>);
          break;
        }
        case 'role_select':
          rows.push(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder().setCustomId(def.customId ?? `rsel_${Date.now()}`).setPlaceholder(def.placeholder ?? 'Select a role').setMinValues(def.minValues ?? 1).setMaxValues(def.maxValues ?? 1)
          ) as ActionRowBuilder<AnyComponentBuilder>);
          break;
        case 'user_select':
          rows.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder().setCustomId(def.customId ?? `usel_${Date.now()}`).setPlaceholder(def.placeholder ?? 'Select a user').setMinValues(def.minValues ?? 1).setMaxValues(def.maxValues ?? 1)
          ) as ActionRowBuilder<AnyComponentBuilder>);
          break;
        case 'channel_select':
          rows.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(def.customId ?? `csel_${Date.now()}`).setPlaceholder(def.placeholder ?? 'Select a channel').setMinValues(def.minValues ?? 1).setMaxValues(def.maxValues ?? 1)
          ) as ActionRowBuilder<AnyComponentBuilder>);
          break;
        case 'mentionable_select':
          rows.push(new ActionRowBuilder<MentionableSelectMenuBuilder>().addComponents(
            new MentionableSelectMenuBuilder().setCustomId(def.customId ?? `msel_${Date.now()}`).setPlaceholder(def.placeholder ?? 'Select').setMinValues(def.minValues ?? 1).setMaxValues(def.maxValues ?? 1)
          ) as ActionRowBuilder<AnyComponentBuilder>);
          break;
      }
    }

    if (rows.length === 0) return { success: false, message: 'Template has no component data to render' };

    const sent = await ch.send({ content: content || undefined, components: rows } as Parameters<TextChannel['send']>[0]);
    return {
      success: true,
      message: `✅ Component template **"${name}"** sent to **#${ch.name}** (message ID: \`${sent.id}\`)`,
      data: { messageId: sent.id },
    };
  }
}
