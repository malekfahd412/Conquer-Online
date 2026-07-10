import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface ValidationIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

function validateEmbedData(data: {
  title?: string | null;
  description?: string | null;
  color?: number | null;
  author?: { name: string } | null;
  footer?: { text: string } | null;
  image?: { url: string } | null;
  thumbnail?: { url: string } | null;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let totalChars = 0;

  const count = (s: string | null | undefined) => { totalChars += s?.length ?? 0; };

  if (data.title) {
    count(data.title);
    if (data.title.length > 256) issues.push({ severity: 'error', field: 'title', message: `Title is ${data.title.length} chars — max is 256` });
  }

  if (data.description) {
    count(data.description);
    if (data.description.length > 4096) issues.push({ severity: 'error', field: 'description', message: `Description is ${data.description.length} chars — max is 4096` });
    if (data.description.length > 2000) issues.push({ severity: 'warning', field: 'description', message: `Description is long (${data.description.length} chars) — consider splitting into fields` });
  }

  if (data.author) {
    count(data.author.name);
    if (data.author.name.length > 256) issues.push({ severity: 'error', field: 'author.name', message: `Author name is ${data.author.name.length} chars — max is 256` });
  }

  if (data.footer) {
    count(data.footer.text);
    if (data.footer.text.length > 2048) issues.push({ severity: 'error', field: 'footer.text', message: `Footer is ${data.footer.text.length} chars — max is 2048` });
  }

  if (data.fields.length > 25) {
    issues.push({ severity: 'error', field: 'fields', message: `${data.fields.length} fields — max is 25` });
  }

  let inlineRun = 0;
  for (const [i, f] of data.fields.entries()) {
    count(f.name); count(f.value);
    if (!f.name || f.name.trim() === '') issues.push({ severity: 'error', field: `fields[${i}].name`, message: 'Field name cannot be empty' });
    else if (f.name.length > 256) issues.push({ severity: 'error', field: `fields[${i}].name`, message: `Field name is ${f.name.length} chars — max 256` });
    if (!f.value || f.value.trim() === '') issues.push({ severity: 'error', field: `fields[${i}].value`, message: 'Field value cannot be empty' });
    else if (f.value.length > 1024) issues.push({ severity: 'error', field: `fields[${i}].value`, message: `Field value is ${f.value.length} chars — max 1024` });
    if (f.inline) inlineRun++; else inlineRun = 0;
    if (inlineRun > 3) issues.push({ severity: 'warning', field: `fields[${i}]`, message: 'More than 3 consecutive inline fields — Discord may wrap them oddly' });
  }

  if (totalChars > 6000) issues.push({ severity: 'error', field: 'total', message: `Total embed characters: ${totalChars} — max is 6000` });
  else if (totalChars > 5000) issues.push({ severity: 'warning', field: 'total', message: `Total embed characters: ${totalChars} — approaching the 6000 limit` });

  if (!data.title && !data.description && data.fields.length === 0) {
    issues.push({ severity: 'warning', field: 'content', message: 'Embed has no title, description, or fields — it will appear empty' });
  }

  return issues;
}

export class EmbedValidatorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'embed_validator',
    description: 'Validates an existing embed against Discord API limits and best practices. Reports errors (will cause API failure) and warnings (display issues).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID containing the embed' },
        message_id: { type: 'string', description: 'Message ID to validate' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Validate the embed in #announcements message 123456'],
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
    if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds to validate' };

    const results: string[] = [`🔍 **Embed Validator** — Message \`${messageId}\` in #${ch.name}`, ''];

    for (const [idx, e] of msg.embeds.entries()) {
      const issues = validateEmbedData(e);
      const errors = issues.filter(i => i.severity === 'error');
      const warnings = issues.filter(i => i.severity === 'warning');
      results.push(`**Embed ${idx + 1}/${msg.embeds.length}:**`);
      if (issues.length === 0) {
        results.push('✅ No issues found — embed is valid');
      } else {
        if (errors.length) results.push(`❌ **${errors.length} error(s):**\n${errors.map(i => `  • [${i.field}] ${i.message}`).join('\n')}`);
        if (warnings.length) results.push(`⚠️ **${warnings.length} warning(s):**\n${warnings.map(i => `  • [${i.field}] ${i.message}`).join('\n')}`);
      }
      results.push('');
    }

    const allIssues = msg.embeds.flatMap(e => validateEmbedData(e));
    const status = allIssues.some(i => i.severity === 'error') ? '❌ Validation failed' : '✅ Valid';
    results.push(`**Result:** ${status}`);

    return { success: true, message: results.join('\n') };
  }
}
