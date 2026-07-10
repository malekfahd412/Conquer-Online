import { AttachmentBuilder, Message, type ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../utils/logger';

const DISCORD_MAX_LENGTH = 1900;

export type ReplyTarget = ChatInputCommandInteraction | Message;

export interface DeliveryOptions {
  filename?: string;
}

export class ResponseDeliveryService {
  /**
   * Send an AI response to a Discord interaction or message.
   * Automatically switches to file attachment when content exceeds the safe limit.
   */
  static async send(
    target: ReplyTarget,
    content: string,
    options: DeliveryOptions = {},
  ): Promise<void> {
    if (!content || content.length === 0) {
      await ResponseDeliveryService._sendText(target, '_(empty response)_');
      return;
    }

    if (content.length <= DISCORD_MAX_LENGTH) {
      await ResponseDeliveryService._sendText(target, content);
      return;
    }

    // Oversized — try file attachment first
    const filename = options.filename ?? ResponseDeliveryService._autoFilename(content);
    const notice = `📄 The response was too large for Discord, so I've attached it as a text file.`;

    try {
      const buffer = Buffer.from(content, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: filename });
      await ResponseDeliveryService._sendFile(target, notice, attachment);
      logger.info(`ResponseDeliveryService: sent oversized response (${content.length} chars) as ${filename}`);
    } catch (fileErr) {
      logger.error('ResponseDeliveryService: file upload failed — falling back to chunked text', fileErr);
      // Fallback: split into safe chunks so the response is never lost
      const chunks = ResponseDeliveryService._chunk(content, DISCORD_MAX_LENGTH);
      let first = true;
      for (const chunk of chunks) {
        try {
          if (first) {
            await ResponseDeliveryService._sendText(target, chunk);
            first = false;
          } else {
            // Subsequent chunks go to the channel directly
            const channel = target instanceof Message
              ? target.channel
              : target.channel;
            if (channel && 'send' in channel) {
              await (channel as { send: (o: { content: string }) => Promise<unknown> }).send({ content: chunk });
            }
          }
        } catch (chunkErr) {
          logger.error('ResponseDeliveryService: chunk send failed', chunkErr);
        }
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static async _sendText(target: ReplyTarget, content: string): Promise<void> {
    if (target instanceof Message) {
      await target.reply({ content });
    } else {
      await target.editReply({ content });
    }
  }

  private static async _sendFile(
    target: ReplyTarget,
    content: string,
    file: AttachmentBuilder,
  ): Promise<void> {
    if (target instanceof Message) {
      await target.reply({ content, files: [file] });
    } else {
      await target.editReply({ content, files: [file] });
    }
  }

  /** Choose a descriptive filename based on content heuristics. */
  private static _autoFilename(content: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const lower = content.toLowerCase();
    if (lower.includes('## implementation') || lower.includes('# implementation')) return `implementation-report.txt`;
    if (lower.includes('## task') || lower.includes('# task')) return `task-report.txt`;
    if (lower.includes('workflow')) return `workflow.txt`;
    if (lower.includes('backup') || lower.includes('export')) return `export-report.txt`;
    if (lower.includes('audit') || lower.includes('diagnostic')) return `audit-report.txt`;
    if (lower.startsWith('```') || content.includes('```')) return `${ts}-response.txt`;
    if (lower.includes('## ') || lower.includes('# ')) return `${ts}-report.txt`;
    return `ai-response.txt`;
  }

  /** Split text into chunks of at most `size` characters. */
  private static _chunk(text: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.slice(i, i + size));
    }
    return chunks;
  }
}
