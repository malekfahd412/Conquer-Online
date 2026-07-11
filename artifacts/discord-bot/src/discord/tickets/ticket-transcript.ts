import type { GuildTextBasedChannel } from 'discord.js';

export interface TranscriptResult {
  markdown: string;
  html: string;
  messageCount: number;
}

export async function generateTranscript(channel: GuildTextBasedChannel): Promise<TranscriptResult> {
  const collected: { author: string; authorId: string; content: string; timestamp: string; attachments: string[] }[] = [];
  let lastId: string | undefined;

  for (let i = 0; i < 20; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId });
    if (batch.size === 0) break;
    for (const msg of batch.values()) {
      collected.push({
        author: msg.author.tag,
        authorId: msg.author.id,
        content: msg.content || '_[embed/attachment only]_',
        timestamp: new Date(msg.createdTimestamp).toISOString(),
        attachments: Array.from(msg.attachments.values()).map(a => a.url),
      });
    }
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }

  collected.reverse();

  const mdLines = [
    `# Transcript — #${channel.name}`,
    `Generated: ${new Date().toISOString()}`,
    `Messages: ${collected.length}`,
    '',
    '---',
    '',
  ];
  for (const m of collected) {
    mdLines.push(`**${m.author}** (${m.timestamp})`);
    mdLines.push(m.content);
    for (const a of m.attachments) mdLines.push(`📎 ${a}`);
    mdLines.push('');
  }

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const htmlLines = [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    `<title>Transcript — ${escapeHtml(channel.name)}</title>`,
    '<style>body{font-family:sans-serif;background:#313338;color:#dbdee1;padding:20px}',
    '.msg{margin-bottom:12px;padding:8px;border-radius:6px;background:#2b2d31}',
    '.author{font-weight:bold;color:#5865f2}.ts{color:#949ba4;font-size:12px;margin-left:8px}',
    '.attachment{color:#00a8fc}</style></head><body>',
    `<h2>Transcript — #${escapeHtml(channel.name)}</h2>`,
    `<p>Generated: ${new Date().toISOString()} — ${collected.length} messages</p><hr>`,
  ];
  for (const m of collected) {
    htmlLines.push(`<div class="msg"><span class="author">${escapeHtml(m.author)}</span><span class="ts">${m.timestamp}</span>`);
    htmlLines.push(`<div>${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>`);
    for (const a of m.attachments) htmlLines.push(`<div class="attachment">📎 <a href="${a}">${a}</a></div>`);
    htmlLines.push('</div>');
  }
  htmlLines.push('</body></html>');

  return { markdown: mdLines.join('\n'), html: htmlLines.join('\n'), messageCount: collected.length };
}
