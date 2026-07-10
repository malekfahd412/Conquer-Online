import { EmbedBuilder, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { parseColor } from './embed-themes';
import { resolveVariables } from './embed-variables';

export class ImportEmbedJsonTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'import_embed_json',
    description: 'Creates and sends a Discord embed from a raw JSON specification. Supports full embed structure including fields, author, footer, image, and thumbnail.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to send the embed to' },
        json: { type: 'string', description: 'JSON string of the embed data. Fields: title, description, color (hex), author {name,url,iconURL}, footer {text,iconURL}, image, thumbnail, timestamp (true/false), fields [{name,value,inline}]' },
        resolve_variables: { type: 'string', description: 'Set to "true" to resolve {guild.name}, {member.name}, etc. in the embed text' },
      },
      required: ['channel', 'json'],
    },
    dangerous: false,
    examples: [
      'Import embed JSON into #announcements',
      'Send this embed JSON to #general: {"title":"Hello","description":"World","color":"#5865F2"}',
    ],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const jsonStr = String(params['json'] ?? '').trim();
    const doResolve = String(params['resolve_variables'] ?? '').toLowerCase() === 'true';

    if (!jsonStr) return { success: false, message: 'json parameter is required' };

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return { success: false, message: 'Invalid JSON — could not parse the embed specification' };
    }

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const resolve = (s: string) => doResolve ? resolveVariables(s, { guild }) : s;

    try {
      const embed = new EmbedBuilder();

      if (raw['title']) embed.setTitle(resolve(String(raw['title'])).slice(0, 256));
      if (raw['description']) embed.setDescription(resolve(String(raw['description'])).slice(0, 4096));
      if (raw['color']) embed.setColor(parseColor(String(raw['color'])));
      if (raw['url']) embed.setURL(String(raw['url']));
      if (raw['timestamp'] === true || raw['timestamp'] === 'true') embed.setTimestamp();

      const author = raw['author'] as Record<string, string> | undefined;
      if (author?.name) embed.setAuthor({ name: resolve(author.name).slice(0, 256), url: author.url, iconURL: author.iconURL });

      const footer = raw['footer'] as Record<string, string> | undefined;
      if (footer?.text) embed.setFooter({ text: resolve(footer.text).slice(0, 2048), iconURL: footer.iconURL });

      if (raw['image']) embed.setImage(String(raw['image']));
      if (raw['thumbnail']) embed.setThumbnail(String(raw['thumbnail']));

      const fields = raw['fields'] as Array<{ name: string; value: string; inline?: boolean }> | undefined;
      if (Array.isArray(fields) && fields.length > 0) {
        embed.setFields(fields.slice(0, 25).map(f => ({
          name: resolve(f.name ?? 'Field').slice(0, 256),
          value: resolve(f.value ?? '\u200b').slice(0, 1024),
          inline: Boolean(f.inline),
        })));
      }

      await ch.send({ embeds: [embed] });
      return { success: true, message: `✅ Embed imported and sent to **#${ch.name}**` };
    } catch (err) {
      return { success: false, message: `Failed to build embed: ${(err as Error).message}` };
    }
  }
}
