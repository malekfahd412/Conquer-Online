import { ChannelType, ComponentType, ButtonStyle } from 'discord.js';
import type {
  Guild, TextChannel, ButtonComponent,
  StringSelectMenuComponent, RoleSelectMenuComponent,
  UserSelectMenuComponent, ChannelSelectMenuComponent,
  MentionableSelectMenuComponent, ActionRow, MessageActionRowComponent,
} from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const STYLE_NAMES: Partial<Record<ButtonStyle, string>> = {
  [ButtonStyle.Primary]: 'Primary',
  [ButtonStyle.Secondary]: 'Secondary',
  [ButtonStyle.Success]: 'Success',
  [ButtonStyle.Danger]: 'Danger',
  [ButtonStyle.Link]: 'Link',
};

export class ComponentInspectorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'component_inspector',
    description: 'Inspects all interactive components (buttons and select menus) on a message and reports their configuration, custom IDs, styles, and state.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID to inspect' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Inspect components on message 123456 in #verify'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let msg;
    try { msg = await ch.messages.fetch(messageId); } catch {
      return { success: false, message: `Message \`${messageId}\` not found` };
    }

    if (msg.components.length === 0) return { success: true, message: `Message \`${messageId}\` has no interactive components` };

    const lines = [
      `🔍 **Component Inspector** — Message \`${messageId}\` in #${ch.name}`,
      `**${msg.components.length} action row(s)**`,
      '',
    ];

    for (const [ri, topLevel] of msg.components.entries()) {
      // Narrow to ActionRow which has a components property
      const row = topLevel as ActionRow<MessageActionRowComponent>;
      if (!('components' in row)) continue;

      lines.push(`**Row ${ri + 1} (${row.components.length} component(s)):**`);
      for (const [ci, comp] of row.components.entries()) {
        if (comp.type === ComponentType.Button) {
          const btn = comp as ButtonComponent;
          const styleName = STYLE_NAMES[btn.style] ?? String(btn.style);
          lines.push(`  ${ci + 1}. 🔲 **Button** — "${btn.label ?? ''}" | Style: ${styleName} | Disabled: ${btn.disabled}${btn.url ? ` | URL: ${btn.url}` : ` | Custom ID: \`${btn.customId}\``}${btn.emoji ? ` | Emoji: ${btn.emoji.name}` : ''}`);
        } else if (comp.type === ComponentType.StringSelect) {
          const sel = comp as StringSelectMenuComponent;
          lines.push(`  ${ci + 1}. 📋 **StringSelect** — Custom ID: \`${sel.customId}\` | Disabled: ${sel.disabled} | Min: ${sel.minValues}, Max: ${sel.maxValues}`);
          if (sel.options.length > 0) {
            lines.push(`     Options (${sel.options.length}):`);
            for (const opt of sel.options.slice(0, 10)) {
              lines.push(`       • "${opt.label}" → \`${opt.value}\`${opt.description ? ` — ${opt.description}` : ''}${opt.default ? ' [default]' : ''}`);
            }
            if (sel.options.length > 10) lines.push(`       _...and ${sel.options.length - 10} more_`);
          }
        } else if (comp.type === ComponentType.RoleSelect) {
          const sel = comp as RoleSelectMenuComponent;
          lines.push(`  ${ci + 1}. 📋 **RoleSelect** — Custom ID: \`${sel.customId}\` | Disabled: ${sel.disabled} | Min: ${sel.minValues}, Max: ${sel.maxValues}`);
        } else if (comp.type === ComponentType.UserSelect) {
          const sel = comp as UserSelectMenuComponent;
          lines.push(`  ${ci + 1}. 📋 **UserSelect** — Custom ID: \`${sel.customId}\` | Disabled: ${sel.disabled} | Min: ${sel.minValues}, Max: ${sel.maxValues}`);
        } else if (comp.type === ComponentType.ChannelSelect) {
          const sel = comp as ChannelSelectMenuComponent;
          lines.push(`  ${ci + 1}. 📋 **ChannelSelect** — Custom ID: \`${sel.customId}\` | Disabled: ${sel.disabled} | Min: ${sel.minValues}, Max: ${sel.maxValues}`);
        } else if (comp.type === ComponentType.MentionableSelect) {
          const sel = comp as MentionableSelectMenuComponent;
          lines.push(`  ${ci + 1}. 📋 **MentionableSelect** — Custom ID: \`${sel.customId}\` | Disabled: ${sel.disabled} | Min: ${sel.minValues}, Max: ${sel.maxValues}`);
        } else {
          const unknown = comp as { type: number };
          lines.push(`  ${ci + 1}. Unknown component type: ${unknown.type}`);
        }
      }
      lines.push('');
    }

    return { success: true, message: lines.join('\n') };
  }
}
