// ─────────────────────────────────────────────────────────────────────────────
// Ticket Review System Pro — Control Center renderer.
//
// Renders the review configuration section inside the Ticket Panel Designer.
// All custom IDs live in the tp:rv:* namespace.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { TicketPanel } from '../../../community/tickets/types';
import { DEFAULT_REVIEW_CONFIG } from '../../../community/tickets/types';
import { checkColor, verifyBuilder, assertUniqueCustomIds } from '../cc-debug';
import { TP } from './tp-ids';
import type { CCPayload } from '../cc-renderer';

const FILE = 'tp-review-renderer.ts';

function btn(label: string, id: string, style: ButtonStyle, disabled = false): ButtonBuilder {
  return verifyBuilder(FILE, 'btn', `btn:${id}`, () =>
    new ButtonBuilder().setLabel(label).setCustomId(id).setStyle(style).setDisabled(disabled),
  );
}

function fmtBool(v: boolean): string {
  return v ? '🟢 On' : '🔴 Off';
}

// ── Review Section ───────────────────────────────────────────────────────────

export function buildReviewSection(panel: TicketPanel): CCPayload {
  const fn = 'buildReviewSection';
  const cfg = { ...DEFAULT_REVIEW_CONFIG, ...(panel.reviewConfig ?? {}) };
  const color = checkColor(FILE, fn, 'color', 0x57f287);

  const dmPreview = cfg.dmMessage
    ? (cfg.dmMessage.length > 150 ? cfg.dmMessage.slice(0, 147) + '…' : cfg.dmMessage)
    : DEFAULT_REVIEW_CONFIG.dmMessage;

  const embed = verifyBuilder(FILE, fn, 'embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('⭐ Review System')
      .setDescription(
        'After a ticket closes, the opener receives a DM with **1–5 star buttons**. ' +
        'Clicking a star shows an optional comment prompt, then logs the review to your channel.',
      )
      .addFields(
        { name: '✅ Enabled',           value: fmtBool(cfg.enabled),          inline: true },
        { name: '💬 Require Comment',   value: fmtBool(cfg.requireComment),    inline: true },
        { name: '🕵️ Anonymous Reviews', value: fmtBool(cfg.anonymousReviews),  inline: true },
        {
          name: '📣 Review Log Channel',
          value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : '_Not set — reviews won\'t be logged_',
          inline: false,
        },
        {
          name: '✉️ DM Message',
          value: `\`\`\`${dmPreview}\`\`\``,
          inline: false,
        },
      )
      .setFooter({ text: 'Reviews are permanent and cannot be changed after submission.' }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(
      cfg.enabled ? '🔴 Disable Reviews' : '🟢 Enable Reviews',
      TP.RV.tog(panel.id, 'enabled'),
      cfg.enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
    ),
    btn(
      cfg.requireComment ? '💬 Require Comment: On' : '💬 Require Comment: Off',
      TP.RV.tog(panel.id, 'requireComment'),
      cfg.requireComment ? ButtonStyle.Primary : ButtonStyle.Secondary,
    ),
    btn(
      cfg.anonymousReviews ? '🕵️ Anonymous: On' : '🕵️ Anonymous: Off',
      TP.RV.tog(panel.id, 'anonymousReviews'),
      cfg.anonymousReviews ? ButtonStyle.Primary : ButtonStyle.Secondary,
    ),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📣 Set Log Channel', TP.RV.edit(panel.id, 'logChannel'), ButtonStyle.Secondary),
    btn('✉️ Edit DM Message',  TP.RV.edit(panel.id, 'dmMessage'),  ButtonStyle.Secondary),
    btn('← Dashboard', `tp:dash:${panel.id}`, ButtonStyle.Secondary),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1] };
  assertUniqueCustomIds('buildReviewSection', payload);
  return payload;
}

// ── Edit Modals ──────────────────────────────────────────────────────────────

export function buildReviewLogChannelModal(panel: TicketPanel): ModalBuilder {
  const cfg = { ...DEFAULT_REVIEW_CONFIG, ...(panel.reviewConfig ?? {}) };
  return new ModalBuilder()
    .setCustomId(TP.RV.rvModal(panel.id, 'logChannel'))
    .setTitle('Set Review Log Channel')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('Channel ID (leave blank to clear)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click a channel → Copy ID')
          .setValue(cfg.logChannelId ?? '')
          .setRequired(false)
          .setMaxLength(20),
      ),
    );
}

export function buildReviewDMMessageModal(panel: TicketPanel): ModalBuilder {
  const cfg = { ...DEFAULT_REVIEW_CONFIG, ...(panel.reviewConfig ?? {}) };
  return new ModalBuilder()
    .setCustomId(TP.RV.rvModal(panel.id, 'dmMessage'))
    .setTitle('Edit Review DM Message')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('dmMessage')
          .setLabel('Message sent to the ticket opener')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Thank you for contacting our support team! Please rate your experience.')
          .setValue(cfg.dmMessage || DEFAULT_REVIEW_CONFIG.dmMessage)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );
}
