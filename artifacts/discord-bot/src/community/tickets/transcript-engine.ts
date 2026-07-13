// ─────────────────────────────────────────────────────────────────────────────
// TranscriptEngine — generates and persists ticket transcripts. Owns
// data/tickets/transcripts.json exclusively.
// ─────────────────────────────────────────────────────────────────────────────
import { AttachmentBuilder, type Guild, type GuildTextBasedChannel, type TextChannel } from 'discord.js';
import { JsonStore } from './store';
import type { TicketPanel, TicketRecord, TranscriptRecord } from './types';
import { logger } from '../../utils/logger';

interface TranscriptData {
  transcripts: TranscriptRecord[];
}

export interface GeneratedTranscript {
  markdown: string;
  html: string;
  messageCount: number;
}

const store = new JsonStore<TranscriptData>('transcripts.json', () => ({ transcripts: [] }));

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class TranscriptEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  async generate(channel: GuildTextBasedChannel): Promise<GeneratedTranscript> {
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

    const mdLines = [`# Transcript — #${channel.name}`, `Generated: ${new Date().toISOString()}`, `Messages: ${collected.length}`, '', '---', ''];
    for (const m of collected) {
      mdLines.push(`**${m.author}** (${m.timestamp})`);
      mdLines.push(m.content);
      for (const a of m.attachments) mdLines.push(`📎 ${a}`);
      mdLines.push('');
    }

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

  async persist(ticket: TicketRecord, result: GeneratedTranscript, deliveredChannelId?: string): Promise<TranscriptRecord> {
    return store.mutate(data => {
      const record: TranscriptRecord = {
        ticketId: ticket.id,
        guildId: ticket.guildId,
        panelId: ticket.panelId,
        number: ticket.number,
        generatedAt: Date.now(),
        messageCount: result.messageCount,
        markdown: result.markdown,
        html: result.html,
        deliveredChannelId,
      };
      data.transcripts = data.transcripts.filter(t => t.ticketId !== ticket.id);
      data.transcripts.push(record);
      return record;
    });
  }

  async get(ticketId: string): Promise<TranscriptRecord | undefined> {
    const data = await store.read();
    return data.transcripts.find(t => t.ticketId === ticketId);
  }

  /** `cfg` should be the ticket-type-resolved config (see `resolveTicketType`) so `cfg.transcript` reflects this specific ticket type. */
  async deliver(guild: Guild, cfg: TicketPanel, ticket: TicketRecord, closedByTag: string): Promise<void> {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const result = await this.generate(channel as GuildTextBasedChannel);
    const targetChannelId = cfg.transcript.channelId;
    let deliveredChannelId: string | undefined;

    if (cfg.transcript.enabled && targetChannelId) {
      const tc = await guild.channels.fetch(targetChannelId).catch(() => null);
      if (tc?.isTextBased()) {
        // Deliver all requested formats (html and/or markdown)
        const files: AttachmentBuilder[] = [];
        if (cfg.transcript.formats.includes('html')) {
          files.push(new AttachmentBuilder(Buffer.from(result.html, 'utf-8'), { name: `ticket-${ticket.number}.html` }));
        }
        if (cfg.transcript.formats.includes('markdown')) {
          files.push(new AttachmentBuilder(Buffer.from(result.markdown, 'utf-8'), { name: `ticket-${ticket.number}.md` }));
        }
        if (files.length === 0) {
          // Fallback: deliver markdown if no format explicitly enabled
          files.push(new AttachmentBuilder(Buffer.from(result.markdown, 'utf-8'), { name: `ticket-${ticket.number}.md` }));
        }
        await (tc as TextChannel).send({ content: `📄 Transcript for ticket #${ticket.number} (closed by ${closedByTag})`, files }).catch(err =>
          logger.warning('[TICKETS] TranscriptEngine failed to deliver transcript', err),
        );
        deliveredChannelId = tc.id;
      }
    }

    if (cfg.transcript.dmUser) {
      const opener = await guild.members.fetch(ticket.openerId).catch(() => null);
      if (opener) {
        // DM the preferred format (html first, then markdown)
        const dmFile = cfg.transcript.formats.includes('html')
          ? new AttachmentBuilder(Buffer.from(result.html, 'utf-8'), { name: `ticket-${ticket.number}.html` })
          : new AttachmentBuilder(Buffer.from(result.markdown, 'utf-8'), { name: `ticket-${ticket.number}.md` });
        await opener.send({ content: `📄 Here is the transcript for your ticket #${ticket.number}.`, files: [dmFile] }).catch(() => {});
      }
    }

    await this.persist(ticket, result, deliveredChannelId);
  }
}

export const transcriptEngine = new TranscriptEngine();
