// ─────────────────────────────────────────────────────────────────────────────
// Order Channel Renderer — builds the comprehensive pinned order summary.
// Shows a Customer Card, Product Card, Payment Card, and Timeline Card
// as a single coherent set of embeds pinned to the top of the order channel.
// All cards edit in place — no duplicate embeds on status changes.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { StoreOrder, StoreProduct, OrderStatus, PaymentMethod } from '../models/index.js';
import { STATUS_COLORS, STATUS_LABELS, STATUS_ICONS, buildCompactTimelineField } from './timeline-renderer.js';

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

const STORE_COLOR = 0xf5a623;

function formatPrice(price: number, currency: string): string {
  return `${price.toLocaleString()} ${currency}`;
}

// ── Customer Card ─────────────────────────────────────────────────────────────

export function buildCustomerCardEmbed(order: StoreOrder, customerTag: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('👤 Customer Information')
    .setColor(0x5865f2)
    .addFields(
      { name: '👤 Customer', value: `<@${order.userId}>\n${customerTag}`, inline: true },
      { name: '📋 Order ID', value: order.orderId, inline: true },
      { name: '📅 Ordered', value: `<t:${Math.floor(order.createdAt / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: 'Customer Card' });
}

// ── Product Card ──────────────────────────────────────────────────────────────

export function buildProductCardEmbed(
  order: StoreOrder,
  product: StoreProduct,
  variantName?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🎁 Product Information')
    .setColor(STORE_COLOR)
    .addFields(
      { name: '🎁 Product', value: product.name, inline: true },
      { name: '📊 Quantity', value: String(order.quantity), inline: true },
      { name: '🏷️ Unit Price', value: formatPrice(order.price, product.currency), inline: true },
    )
    .setFooter({ text: 'Product Card' });

  if (variantName) {
    embed.addFields({ name: '🔀 Variant', value: variantName, inline: true });
  }
  if (product.description) {
    embed.setDescription(product.description.slice(0, 200));
  }
  if (product.thumbnail ?? product.image) {
    embed.setThumbnail((product.thumbnail ?? product.image)!);
  }

  const badges = product.badges ?? [];
  if (badges.length > 0) {
    const badgeMap: Record<string, string> = {
      new: '🆕 New',
      popular: '🔥 Popular',
      best_seller: '⭐ Best Seller',
      sale: '🏷️ On Sale',
      limited: '⏰ Limited',
    };
    embed.addFields({ name: '🏅 Badges', value: badges.map(b => badgeMap[b] ?? b).join(' • '), inline: true });
  }

  return embed;
}

// ── Payment Card ──────────────────────────────────────────────────────────────

export function buildPaymentCardEmbed(
  order: StoreOrder,
  product: StoreProduct,
  paymentMethod?: PaymentMethod,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('💳 Payment Information')
    .setColor(paymentMethod?.color ?? 0xffd700)
    .addFields(
      {
        name: '🧾 Original Price',
        value: formatPrice(order.originalPrice ?? order.totalPrice, product.currency),
        inline: true,
      },
    );

  if (order.discountAmount > 0) {
    embed.addFields({ name: '🎉 Discount', value: `-${formatPrice(order.discountAmount, product.currency)}`, inline: true });
  }

  embed.addFields({ name: '💰 Total Due', value: `**${formatPrice(order.totalPrice, product.currency)}**`, inline: true });

  if (paymentMethod) {
    embed.addFields({ name: '💳 Payment Method', value: `${paymentMethod.icon} ${paymentMethod.name}`, inline: true });
  }

  if (order.couponId) {
    embed.addFields({ name: '🎟️ Coupon Used', value: `\`${order.couponId}\``, inline: true });
  }

  // Proof status
  if (order.proof) {
    const proofStatus = order.proof.reviewDecision === 'approved'
      ? '✅ Approved'
      : order.proof.reviewDecision === 'rejected'
        ? '❌ Rejected'
        : order.proof.reviewDecision === 'more_info'
          ? '⚠️ More Info Needed'
          : '🕐 Pending Review';
    embed.addFields({ name: '📎 Proof Status', value: proofStatus, inline: true });
  }

  embed.setFooter({ text: 'Payment Card' });
  return embed;
}

// ── Summary Card ──────────────────────────────────────────────────────────────

export function buildOrderSummaryCardEmbed(order: StoreOrder): EmbedBuilder {
  const statusColor = STATUS_COLORS[order.status] ?? 0xf5a623;
  const statusIcon = STATUS_ICONS[order.status] ?? '📋';
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  const embed = new EmbedBuilder()
    .setTitle(`🧾 Order Summary — ${order.orderId}`)
    .setColor(statusColor)
    .addFields(
      { name: '📊 Status', value: `${statusIcon} **${statusLabel}**`, inline: true },
      { name: '🕐 Last Update', value: `<t:${Math.floor(order.updatedAt / 1000)}:R>`, inline: true },
    );

  if (order.staffId) {
    embed.addFields({ name: '👮 Handled By', value: `<@${order.staffId}>`, inline: true });
  }

  // Compact timeline
  embed.addFields(buildCompactTimelineField(order));

  if (order.notes) {
    embed.addFields({ name: '📝 Staff Notes', value: order.notes });
  }

  embed.setFooter({ text: 'Order Summary • Updates automatically' }).setTimestamp(order.updatedAt);
  return embed;
}

// ── Order Channel Action Buttons ─────────────────────────────────────────────

export function buildOrderChannelComponents(order: StoreOrder, isStaff: boolean): AnyRow[] {
  const rows: AnyRow[] = [];
  const terminalStatuses: OrderStatus[] = ['Completed', 'Cancelled', 'Refunded'];

  if (terminalStatuses.includes(order.status)) {
    if (isStaff) {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`st:order:refund:${order.orderId}`)
          .setLabel('Issue Refund')
          .setEmoji('💸')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(order.status === 'Refunded'),
        new ButtonBuilder()
          .setCustomId(`st:dn:add:${order.orderId}`)
          .setLabel('Add Note')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Secondary),
      );
      rows.push(row);
    }
    return rows;
  }

  const staffButtons: ButtonBuilder[] = [];
  const buyerButtons: ButtonBuilder[] = [];

  // Staff actions depending on status
  if (isStaff) {
    if (order.status === 'ProofSubmitted') {
      staffButtons.push(
        new ButtonBuilder()
          .setCustomId(`st:pr:approve:${order.orderId}`)
          .setLabel('Approve Payment')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`st:pr:reject:${order.orderId}`)
          .setLabel('Reject Proof')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`st:pr:moreinfo:${order.orderId}`)
          .setLabel('More Info')
          .setEmoji('⚠️')
          .setStyle(ButtonStyle.Secondary),
      );
    } else if (order.status === 'Paid') {
      staffButtons.push(
        new ButtonBuilder()
          .setCustomId(`st:order:prepare:${order.orderId}`)
          .setLabel('Start Preparing')
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Primary),
      );
    } else if (order.status === 'Preparing') {
      staffButtons.push(
        new ButtonBuilder()
          .setCustomId(`st:order:deliver:${order.orderId}`)
          .setLabel('Start Delivery')
          .setEmoji('📦')
          .setStyle(ButtonStyle.Primary),
      );
    } else if (order.status === 'Delivering') {
      staffButtons.push(
        new ButtonBuilder()
          .setCustomId(`st:order:complete:${order.orderId}`)
          .setLabel('Mark Completed')
          .setEmoji('🎉')
          .setStyle(ButtonStyle.Success),
      );
    }

    staffButtons.push(
      new ButtonBuilder()
        .setCustomId(`st:dn:add:${order.orderId}`)
        .setLabel('Add Note')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Secondary),
    );

    if (staffButtons.length > 0) {
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...staffButtons.slice(0, 5)),
      );
    }
  }

  // Buyer actions
  if (order.status === 'WaitingPayment') {
    buyerButtons.push(
      new ButtonBuilder()
        .setCustomId(`st:pm:show:${order.orderId}`)
        .setLabel('View Payment Instructions')
        .setEmoji('💳')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`st:pr:submit:${order.orderId}`)
        .setLabel('Submit Proof')
        .setEmoji('📎')
        .setStyle(ButtonStyle.Success),
    );
  } else if (order.status === 'ProofSubmitted' && !isStaff) {
    buyerButtons.push(
      new ButtonBuilder()
        .setCustomId(`st:pr:view:${order.orderId}`)
        .setLabel('View My Proof')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  // Cancel (both roles, while not in terminal or delivering)
  if (order.status !== 'Delivering' && order.status !== 'ProofSubmitted') {
    buyerButtons.push(
      new ButtonBuilder()
        .setCustomId(`st:order:cancel:${order.orderId}`)
        .setLabel('Cancel Order')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
    );
  }

  if (buyerButtons.length > 0) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buyerButtons.slice(0, 5)),
    );
  }

  return rows.slice(0, 5);
}

// ── All 4 cards together ──────────────────────────────────────────────────────

export function buildOrderChannelEmbeds(
  order: StoreOrder,
  product: StoreProduct,
  customerTag: string,
  paymentMethod?: PaymentMethod,
  variantName?: string,
): EmbedBuilder[] {
  return [
    buildOrderSummaryCardEmbed(order),
    buildCustomerCardEmbed(order, customerTag),
    buildProductCardEmbed(order, product, variantName),
    buildPaymentCardEmbed(order, product, paymentMethod),
  ];
}
