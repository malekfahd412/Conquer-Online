import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { saveTemplate } from './embed-store';

export class SaveEmbedTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'save_embed_template',
    description: 'Saves an embed as a reusable named template. Can save from an existing message OR from provided embed data. Templates persist across bot restarts.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name (unique identifier)' },
        description: { type: 'string', description: 'Optional description of what this template is for' },
        // From existing message
        channel: { type: 'string', description: 'Channel containing the message to save as template (if saving from existing embed)' },
        message_id: { type: 'string', description: 'Message ID to save as template (if saving from existing embed)' },
        // Or from data
        title: { type: 'string', description: 'Embed title (if building template from scratch)' },
        embed_description: { type: 'string', description: 'Embed body text (if building template from scratch)' },
        color: { type: 'string', description: 'Hex color or theme name' },
        footer: { type: 'string', description: 'Footer text' },
        image_url: { type: 'string', description: 'Image URL' },
        thumbnail_url: { type: 'string', description: 'Thumbnail URL' },
        author_name: { type: 'string', description: 'Author name' },
        theme: { type: 'string', description: 'Theme preset name (dark, light, gaming, professional, minimal, modern, neon)' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: [
      'Save the embed in #announcements message 123456 as template "weekly-update"',
      'Save a new embed template named "welcome" with title "Welcome!" and description "Hello {member.name}"',
    ],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    if (!name) return { success: false, message: 'Template name is required' };

    let templateData: Parameters<typeof saveTemplate>[1];

    // From existing message
    if (params['message_id'] && params['channel']) {
      const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
      const ch = guild.channels.cache.find(c =>
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
        (c.id === chQuery || c.name.toLowerCase() === chQuery),
      ) as TextChannel | undefined;
      if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

      let msg;
      try { msg = await ch.messages.fetch(String(params['message_id'])); } catch {
        return { success: false, message: `Message \`${params['message_id']}\` not found` };
      }
      if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds to save' };

      const e = msg.embeds[0];
      templateData = {
        title: e.title ?? undefined,
        description: e.description ?? undefined,
        color: e.color ?? undefined,
        url: e.url ?? undefined,
        author: e.author ? { name: e.author.name, url: e.author.url ?? undefined, iconURL: e.author.iconURL ?? undefined } : undefined,
        footer: e.footer ? { text: e.footer.text, iconURL: e.footer.iconURL ?? undefined } : undefined,
        image: e.image?.url,
        thumbnail: e.thumbnail?.url,
        timestamp: !!e.timestamp,
        fields: e.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })),
      };
    } else {
      // From parameters
      templateData = {
        title: params['title'] ? String(params['title']) : undefined,
        description: params['embed_description'] ? String(params['embed_description']) : undefined,
        color: params['color'] ? parseInt(String(params['color']).replace('#', ''), 16) || undefined : undefined,
        footer: params['footer'] ? { text: String(params['footer']) } : undefined,
        image: params['image_url'] ? String(params['image_url']) : undefined,
        thumbnail: params['thumbnail_url'] ? String(params['thumbnail_url']) : undefined,
        author: params['author_name'] ? { name: String(params['author_name']) } : undefined,
        timestamp: true,
      };
    }

    const t = await saveTemplate(
      name,
      templateData,
      params['description'] ? String(params['description']) : undefined,
      params['theme'] ? String(params['theme']) : undefined,
    );

    return { success: true, message: `✅ Template **"${t.name}"** saved (ID: \`${t.id}\`)\nUse \`load_embed_template\` to send it to any channel.` };
  }
}
