// ─────────────────────────────────────────────────────────────────────────────
// ReviewEngine — Ticket Review System Pro.
//
// After a ticket closes, the opener is sent a DM with 1–5 star rating buttons.
// Clicking a star shows an optional comment modal, then records the review and
// posts it to the configured log channel. Reviews are stored in reviews.json
// and are permanent / duplicate-prevented.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js';
import { JsonStore, genId } from './store';
import type { TicketRecord, TicketPanel, TicketReviewRecord } from './types';
import { DEFAULT_REVIEW_CONFIG } from './types';
import { logger } from '../../utils/logger';

interface ReviewData {
  reviews: TicketReviewRecord[];
}

const store = new JsonStore<ReviewData>('reviews.json', () => ({ reviews: [] }));

export const STAR_LABELS: Readonly<['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐']> =
  ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

export class ReviewEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  async hasReviewed(ticketId: string, userId: string): Promise<boolean> {
    const data = await store.read();
    return data.reviews.some(r => r.ticketId === ticketId && r.openerId === userId);
  }

  async save(review: TicketReviewRecord): Promise<void> {
    await store.mutate(data => {
      data.reviews.push(review);
    });
  }

  async getAll(guildId?: string): Promise<TicketReviewRecord[]> {
    const data = await store.read();
    return guildId ? data.reviews.filter(r => r.guildId === guildId) : data.reviews;
  }

  async getForTicket(ticketId: string): Promise<TicketReviewRecord | undefined> {
    const data = await store.read();
    return data.reviews.find(r => r.ticketId === ticketId);
  }

  /**
   * Sends the review request DM to the ticket opener after a ticket closes.
   * Silently no-ops if reviews are disabled, the panel config is missing, the
   * user already reviewed, or the DM cannot be delivered (DMs closed, etc.).
   */
  async sendReviewDM(client: Client, ticket: TicketRecord, panel: TicketPanel): Promise<void> {
    // Merge over defaults (not a plain `??` fallback) — a panel loaded straight from disk may carry
    // a reviewConfig saved before a newer field (e.g. `enabled`) existed, and a raw fallback would
    // silently read that missing field as `undefined` (falsy) instead of its real default.
    const cfg = { ...DEFAULT_REVIEW_CONFIG, ...(panel.reviewConfig ?? {}) };
    if (!cfg.enabled) return;

    // Idempotency: don't send a second DM if the ticket was somehow closed twice
    if (await this.hasReviewed(ticket.id, ticket.openerId)) return;

    try {
      const user = await client.users.fetch(ticket.openerId);
      const dmChannel = await user.createDM();

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📋 How was our experience?' )
        .setDescription(cfg.dmMessage || DEFAULT_REVIEW_CONFIG.dmMessage)
        .addFields(
          { name: '🎫 Ticket', value: `**#${ticket.number}** — ${ticket.ticketType}`, inline: true },
        )
        .setFooter({ text: 'You may only submit one review per ticket.' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...[1, 2, 3, 4, 5].map(n =>
          new ButtonBuilder()
            .setCustomId(`tk:review:rate:${ticket.id}:${n}`)
            .setLabel(STAR_LABELS[n - 1])
            .setStyle(ButtonStyle.Secondary),
        ),
      );

      await dmChannel.send({ embeds: [embed], components: [row] });
      logger.info(`[REVIEW] Sent review DM for ticket #${ticket.number} to opener ${ticket.openerId}`);
    } catch (err) {
      // DMs closed, user left server, etc. — non-fatal
      logger.warning(`[REVIEW] Could not send review DM for ticket #${ticket.number}`, err);
    }
  }

  /** Builds the review record from all gathered data. */
  buildRecord(opts: {
    ticket: TicketRecord;
    openerId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    anonymous: boolean;
  }): TicketReviewRecord {
    const { ticket, openerId, rating, comment, anonymous } = opts;
    const now = Date.now();
    return {
      id:               genId('rev'),
      guildId:          ticket.guildId,
      panelId:          ticket.panelId,
      ticketId:         ticket.id,
      ticketNumber:     ticket.number,
      ticketType:       ticket.ticketType,
      openerId,
      claimedBy:        ticket.claimedBy,
      closedBy:         ticket.closedBy,
      rating,
      comment:          comment || undefined,
      anonymous,
      responseTimeMs:   ticket.firstStaffReplyAt ? ticket.firstStaffReplyAt - ticket.createdAt : undefined,
      resolutionTimeMs: ticket.closedAt ? ticket.closedAt - ticket.createdAt : undefined,
      reviewedAt:       now,
      ticketCreatedAt:  ticket.createdAt,
      ticketClosedAt:   ticket.closedAt ?? now,
    };
  }
}

export const reviewEngine = new ReviewEngine();
