// ─────────────────────────────────────────────────────────────────────────────
// Coupon Renderer — Discord UI for coupon entry, validation, and management.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { StoreCoupon } from '../models/index.js';

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

const COUPON_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;

// ── Coupon Entry Modal ────────────────────────────────────────────────────────

export function buildCouponEntryModal(productId: string, quantity: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`st:modal:cp:enter:${productId}:${quantity}`)
    .setTitle('Apply Coupon Code')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('code')
          .setLabel('Coupon Code')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('Enter your coupon code (e.g. SUMMER20)'),
      ),
    );
}

// ── Coupon Applied Embed ──────────────────────────────────────────────────────

export function buildCouponAppliedEmbed(
  coupon: StoreCoupon,
  originalPrice: number,
  discountAmount: number,
  finalPrice: number,
  currency: string,
): EmbedBuilder {
  const typeLabel =
    coupon.type === 'percentage'
      ? `${coupon.value}% off`
      : coupon.type === 'fixed'
        ? `-${coupon.value} ${currency}`
        : 'Free item';

  return new EmbedBuilder()
    .setTitle('🎉 Coupon Applied!')
    .setDescription(coupon.description ?? `Coupon code **${coupon.code}** applied successfully.`)
    .setColor(COUPON_COLOR)
    .addFields(
      { name: '🎟️ Coupon Code', value: `\`${coupon.code}\``, inline: true },
      { name: '🏷️ Discount Type', value: typeLabel, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '💰 Original Price', value: `${originalPrice.toLocaleString()} ${currency}`, inline: true },
      { name: '✂️ Discount', value: `-${discountAmount.toLocaleString()} ${currency}`, inline: true },
      { name: '🧾 Final Price', value: `**${finalPrice.toLocaleString()} ${currency}**`, inline: true },
    )
    .setFooter({ text: 'Discount has been applied to your order' });
}

// ── Coupon Invalid Embed ──────────────────────────────────────────────────────

export function buildCouponInvalidEmbed(reason: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('❌ Coupon Invalid')
    .setDescription(reason)
    .setColor(ERROR_COLOR);
}

// ── Coupon Detail Embed (staff view) ─────────────────────────────────────────

export function buildCouponDetailEmbed(coupon: StoreCoupon): EmbedBuilder {
  const now = Date.now();
  const expired = coupon.expiresAt !== undefined && coupon.expiresAt < now;
  const maxed = coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses;
  const isActive = coupon.enabled && !expired && !maxed;

  const typeLabel =
    coupon.type === 'percentage'
      ? `${coupon.value}% percentage discount`
      : coupon.type === 'fixed'
        ? `Fixed -${coupon.value} discount`
        : `Free item (ID: ${coupon.freeItemId ?? 'N/A'})`;

  const embed = new EmbedBuilder()
    .setTitle(`🎟️ Coupon — ${coupon.code}`)
    .setColor(isActive ? COUPON_COLOR : ERROR_COLOR)
    .addFields(
      { name: '📊 Status', value: isActive ? '✅ Active' : expired ? '⌛ Expired' : maxed ? '🚫 Used Up' : '❌ Disabled', inline: true },
      { name: '🏷️ Type', value: typeLabel, inline: true },
      { name: '📊 Uses', value: `${coupon.usedCount}${coupon.maxUses !== undefined ? `/${coupon.maxUses}` : ''} uses`, inline: true },
    );

  if (coupon.expiresAt !== undefined) {
    embed.addFields({ name: '⏰ Expires', value: `<t:${Math.floor(coupon.expiresAt / 1000)}:R>`, inline: true });
  }
  if (coupon.minPurchaseAmount !== undefined) {
    embed.addFields({ name: '📏 Min Purchase', value: String(coupon.minPurchaseAmount), inline: true });
  }
  if (coupon.maxDiscountAmount !== undefined) {
    embed.addFields({ name: '📏 Max Discount', value: String(coupon.maxDiscountAmount), inline: true });
  }
  if (coupon.firstPurchaseOnly) {
    embed.addFields({ name: '🆕 First Purchase Only', value: 'Yes', inline: true });
  }
  if (coupon.roleBased && coupon.allowedRoles.length > 0) {
    embed.addFields({ name: '🎭 Role Restricted', value: coupon.allowedRoles.map(r => `<@&${r}>`).join(', '), inline: false });
  }
  if (coupon.description) {
    embed.setDescription(coupon.description);
  }

  embed.setFooter({ text: `ID: ${coupon.id} • Created <t:${Math.floor(coupon.createdAt / 1000)}:d>` });
  return embed;
}

export function buildCouponManageComponents(couponId: string, enabled: boolean): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:ss:cp:toggle:${couponId}`)
      .setLabel(enabled ? 'Disable' : 'Enable')
      .setEmoji(enabled ? '❌' : '✅')
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`st:ss:cp:delete:${couponId}`)
      .setLabel('Delete Coupon')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('st:ss:coupons')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

// ── Apply Coupon CTA ──────────────────────────────────────────────────────────

export function buildCouponCTAComponents(productId: string, quantity: number): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:cp:enter:${productId}:${quantity}`)
      .setLabel('Apply Coupon Code')
      .setEmoji('🎟️')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}
