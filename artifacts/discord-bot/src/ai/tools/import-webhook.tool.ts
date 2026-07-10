import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface ImportWebhookRecord {
  name: string;
  channelName: string;
  avatarUrl?: string | null;
}

export class ImportWebhookTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'import_webhook',
    description: 'Recreates webhooks in their target channels from a JSON array of {name, channelName, avatarUrl} records (as produced by export_webhook). Discord does not allow importing the original token/URL — each import creates a brand new webhook with a new URL.',
    parameters: {
      type: 'object',
      properties: {
        webhooksJson: { type: 'string', description: 'JSON array string of webhook records' },
      },
      required: ['webhooksJson'],
    },
    dangerous: false,
    examples: ['Import this webhook JSON export'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    let records: ImportWebhookRecord[];
    try {
      records = JSON.parse(String(params['webhooksJson'] ?? '[]')) as ImportWebhookRecord[];
    } catch {
      return { success: false, message: 'webhooksJson is not valid JSON' };
    }
    if (!Array.isArray(records) || records.length === 0) return { success: false, message: 'No webhook records to import' };

    const created: string[] = [];
    const skipped: string[] = [];

    for (const record of records.slice(0, 20)) {
      const name = String(record?.name ?? '').trim();
      const channelName = String(record?.channelName ?? '').trim().toLowerCase();
      if (!name || !channelName) { skipped.push('(invalid record)'); continue; }

      const channel = guild.channels.cache.find(
        c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
      ) as TextChannel | undefined;
      if (!channel) { skipped.push(`${name} (channel "${channelName}" not found)`); continue; }

      try {
        const webhook = await channel.createWebhook({ name, avatar: record.avatarUrl ?? undefined, reason: 'Imported via AI Control Center' });
        created.push(`${webhook.name} in #${channel.name}`);
      } catch {
        skipped.push(name);
      }
    }

    return {
      success: created.length > 0,
      message: `Imported ${created.length} webhook(s) as new webhooks (new URLs — originals cannot be restored)${created.length ? `: ${created.join(', ')}` : ''}${skipped.length ? `. Skipped: ${skipped.join(', ')}` : ''}`,
      data: { created, skipped },
    };
  }
}
