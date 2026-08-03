// ─────────────────────────────────────────────────────────────────────────────
// Store Renderer — builds all embeds and Discord components for the store UI.
// Pure functions: no async, no side effects.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type {
  StoreCategory,
  StoreProduct,
  StoreOrder,
  StoreStatistics,
  OrderStatus,
} from '../models/index.js';

// ── Colour palette ─────────────────────────────────────────────────────────
const STORE_COLOR = 0xf5a623;
const SUCCESS_COLOR = 0x57f287;

const STATUS_COLORS: Record<OrderStatus, number> = {
  Pending: 0xfee75c,
  WaitingPayment: 0xffd700,
  Paid: 0x57f287,
  Delivering: 0x5865f2,
  Completed: 0x00d26a,
  Cancelled: 0xed4245,
  Refunded: 0x8e8e93,
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: '📋 Pending',
  WaitingPayment: '⏳ Waiting Payment',
  Paid: '✅ Paid',
  Delivering: '📦 Delivering',
  Completed: '✅ Completed',
  Cancelled: '❌ Cancelled',
  Refunded: '💸 Refunded',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(price: number, currency: string): string {
  return `${price.toLocaleString()} ${currency}`;
}

function formatStock(product: StoreProduct): string {
  if (product.unlimitedStock) return '♾️ Unlimited';
  if (product.stock === 0) return '❌ Out of Stock';
  return `✅ ${product.stock} in stock`;
}

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

// ── Store Panel ─────────────────────────────────────────────────────────────

export function buildStorePanelEmbed(serverName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🏪 Official Store')
    .setDescription(
      `Welcome to the **${serverName}** store!\n\n` +
        'Browse our collection of in-game items, currency, cosmetics, and services.\n\n' +
        '> 🛒 **Browse Store** — Explore products\n' +
        '> 📦 **My Orders** — View your order history\n' +
        '> 🎫 **Support** — Get help with your order',
    )
    .setColor(STORE_COLOR)
    .setFooter({ text: `${serverName} Store • Powered by Mufasa Bot` })
    .setTimestamp();
}

export function buildStorePanelComponents(): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:panel:browse')
      .setLabel('Browse Store')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('st:panel:orders')
      .setLabel('My Orders')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:panel:support')
      .setLabel('Support')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:panel:refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

// ── Category Browser ────────────────────────────────────────────────────────

export function buildCategorySelectEmbed(categories: StoreCategory[]): EmbedBuilder {
  const desc =
    categories.length === 0
      ? '*No categories are available right now.*'
      : categories.map(c => `${c.emoji} **${c.name}** — ${c.description}`).join('\n');

  return new EmbedBuilder()
    .setTitle('🛒 Browse Store — Choose a Category')
    .setDescription(desc)
    .setColor(STORE_COLOR)
    .setFooter({ text: 'Select a category below to see products' });
}

export function buildCategorySelectComponents(categories: StoreCategory[]): AnyRow[] {
  if (categories.length === 0) return [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId('st:select:category')
    .setPlaceholder('Select a category…')
    .addOptions(
      categories.slice(0, 25).map(c =>
        new StringSelectMenuOptionBuilder()
          .setValue(c.id)
          .setLabel(`${c.emoji} ${c.name}`)
          .setDescription(c.description.slice(0, 100)),
      ),
    );

  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)];
}

// ── Product Browser ─────────────────────────────────────────────────────────

export function buildProductSelectEmbed(category: StoreCategory, products: StoreProduct[]): EmbedBuilder {
  const desc =
    products.length === 0
      ? '*No products are available in this category right now.*'
      : products
          .map(
            p =>
              `**${p.name}** — ${formatPrice(p.price, p.currency)}\n` +
              `${p.description.slice(0, 80)}${p.description.length > 80 ? '…' : ''}`,
          )
          .join('\n\n');

  return new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.name}`)
    .setDescription(desc)
    .setColor(STORE_COLOR)
    .setFooter({ text: 'Select a product below to view details' });
}

export function buildProductSelectComponents(products: StoreProduct[]): AnyRow[] {
  const rows: AnyRow[] = [];

  if (products.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('st:select:product')
      .setPlaceholder('Select a product…')
      .addOptions(
        products.slice(0, 25).map(p =>
          new StringSelectMenuOptionBuilder()
            .setValue(p.id)
            .setLabel(p.name)
            .setDescription(`${formatPrice(p.price, p.currency)} • ${formatStock(p)}`),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('st:browse:back')
        .setLabel('← Back to Categories')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

// ── Product Detail Page ──────────────────────────────────────────────────────

export function buildProductPageEmbed(product: StoreProduct, category: StoreCategory): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(product.name)
    .setDescription(product.description)
    .setColor(STORE_COLOR)
    .addFields(
      { name: '💰 Price', value: formatPrice(product.price, product.currency), inline: true },
      { name: '📦 Stock', value: formatStock(product), inline: true },
      { name: '🗂️ Category', value: `${category.emoji} ${category.name}`, inline: true },
    )
    .setFooter({ text: `Product ID: ${product.id}` })
    .setTimestamp(product.updatedAt);

  if (product.image) embed.setImage(product.image);

  return embed;
}

export function buildProductPageComponents(product: StoreProduct, categoryId: string): AnyRow[] {
  const inStock = product.unlimitedStock || product.stock > 0;

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:product:buy:${product.id}`)
      .setLabel('Buy Now')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!inStock),
    new ButtonBuilder()
      .setCustomId(`st:product:back:${categoryId}`)
      .setLabel('← Back to Products')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row];
}

// ── Quantity Modal ───────────────────────────────────────────────────────────

export function buildQuantityModal(productId: string, productName: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`st:modal:qty:${productId}`)
    .setTitle(`Buy — ${productName.slice(0, 40)}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Quantity')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter a number (e.g. 1)')
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true),
      ),
    );
}

// ── Order Confirmation ───────────────────────────────────────────────────────

export function buildConfirmEmbed(product: StoreProduct, category: StoreCategory, quantity: number): EmbedBuilder {
  const total = product.price * quantity;

  const embed = new EmbedBuilder()
    .setTitle('🛒 Confirm Your Purchase')
    .setColor(STORE_COLOR)
    .addFields(
      { name: '🎁 Product', value: product.name, inline: true },
      { name: '🗂️ Category', value: `${category.emoji} ${category.name}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📊 Quantity', value: String(quantity), inline: true },
      { name: '💰 Unit Price', value: formatPrice(product.price, product.currency), inline: true },
      { name: '🧾 Total', value: `**${formatPrice(total, product.currency)}**`, inline: true },
    )
    .setFooter({ text: 'Press Confirm to place your order' });

  if (product.image) embed.setThumbnail(product.image);

  return embed;
}

export function buildConfirmComponents(productId: string, quantity: number): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:confirm:yes:${productId}:${quantity}`)
      .setLabel('Confirm Purchase')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('st:confirm:no')
      .setLabel('Cancel')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

// ── Order Channel Embed ──────────────────────────────────────────────────────

export function buildOrderEmbed(order: StoreOrder, product: StoreProduct, customerTag: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🧾 Store Order — ${order.orderId}`)
    .setColor(STATUS_COLORS[order.status])
    .addFields(
      { name: '👤 Customer', value: `<@${order.userId}> (${customerTag})`, inline: true },
      { name: '📋 Status', value: STATUS_LABELS[order.status], inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🎁 Product', value: product.name, inline: true },
      { name: '📊 Quantity', value: String(order.quantity), inline: true },
      { name: '🧾 Total', value: `**${formatPrice(order.totalPrice, product.currency)}**`, inline: true },
    )
    .setFooter({ text: `Order ID: ${order.orderId}` })
    .setTimestamp(order.createdAt);

  if (order.staffId) {
    embed.addFields({ name: '👮 Handled By', value: `<@${order.staffId}>`, inline: true });
  }
  if (order.notes) {
    embed.addFields({ name: '📝 Notes', value: order.notes });
  }
  if (product.image) embed.setThumbnail(product.image);

  return embed;
}

export function buildOrderComponents(order: StoreOrder): AnyRow[] {
  const terminalStatuses: OrderStatus[] = ['Completed', 'Cancelled', 'Refunded'];
  if (terminalStatuses.includes(order.status)) return [];

  const buttons: ButtonBuilder[] = [];

  if (order.status === 'WaitingPayment' || order.status === 'Pending') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`st:order:pay:${order.orderId}`)
        .setLabel('Confirm Payment')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
    );
  }

  if (order.status === 'Paid') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`st:order:deliver:${order.orderId}`)
        .setLabel('Deliver Item')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Primary),
    );
  }

  if (order.status === 'Delivering') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`st:order:complete:${order.orderId}`)
        .setLabel('Mark Complete')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
    );
  }

  // Cancel is available until order is in a terminal state or Delivering
  if (order.status !== 'Delivering') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`st:order:cancel:${order.orderId}`)
        .setLabel('Cancel Order')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
    );
  }

  if (buttons.length === 0) return [];

  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons.slice(0, 5))];
}

// ── My Orders ────────────────────────────────────────────────────────────────

export function buildMyOrdersEmbed(orders: StoreOrder[], products: StoreProduct[]): EmbedBuilder {
  if (orders.length === 0) {
    return new EmbedBuilder()
      .setTitle("📦 My Orders")
      .setDescription("*You haven't placed any orders yet.*\n\nUse **Browse Store** to find something!")
      .setColor(STORE_COLOR);
  }

  const productMap = new Map(products.map(p => [p.id, p]));

  const lines = orders.slice(0, 10).map(o => {
    const product = productMap.get(o.productId);
    const name = product?.name ?? 'Unknown Product';
    const currency = product?.currency ?? '';
    return (
      `**${o.orderId}** — ${name}\n` +
      `${STATUS_LABELS[o.status]} • ${formatPrice(o.totalPrice, currency)} • <t:${Math.floor(o.createdAt / 1000)}:R>`
    );
  });

  const embed = new EmbedBuilder()
    .setTitle('📦 My Orders')
    .setDescription(lines.join('\n\n'))
    .setColor(STORE_COLOR)
    .setFooter({ text: orders.length > 10 ? `Showing 10 of ${orders.length} orders (newest first)` : `${orders.length} order(s)` });

  return embed;
}

// ── Admin: Statistics ────────────────────────────────────────────────────────

export function buildStatsEmbed(stats: StoreStatistics): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📊 Store Statistics')
    .setColor(STORE_COLOR)
    .addFields(
      { name: '📋 Total Orders', value: String(stats.totalOrders), inline: true },
      { name: '⏳ Pending', value: String(stats.pending), inline: true },
      { name: '✅ Completed', value: String(stats.completed), inline: true },
      { name: '❌ Cancelled', value: String(stats.cancelled), inline: true },
      { name: '💰 Total Revenue', value: String(stats.revenue), inline: true },
    )
    .setTimestamp();
}

// ── Admin: Category List ─────────────────────────────────────────────────────

export function buildCategoryListEmbed(categories: StoreCategory[]): EmbedBuilder {
  if (categories.length === 0) {
    return new EmbedBuilder()
      .setTitle('🗂️ Store Categories')
      .setDescription('*No categories yet. Use `/store category add` to create one.*')
      .setColor(STORE_COLOR);
  }

  const lines = categories.map(
    (c, i) => `**${i + 1}.** ${c.emoji} **${c.name}** \`${c.id}\`\n${c.description} — ${c.enabled ? '✅ Enabled' : '❌ Disabled'}`,
  );

  return new EmbedBuilder()
    .setTitle('🗂️ Store Categories')
    .setDescription(lines.join('\n\n'))
    .setColor(STORE_COLOR)
    .setFooter({ text: `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}` });
}

// ── Admin: Product List ──────────────────────────────────────────────────────

export function buildProductListEmbed(products: StoreProduct[], category: StoreCategory): EmbedBuilder {
  if (products.length === 0) {
    return new EmbedBuilder()
      .setTitle(`🗂️ Products — ${category.name}`)
      .setDescription('*No products in this category. Use `/store product add` to create one.*')
      .setColor(STORE_COLOR);
  }

  const lines = products.map(
    p =>
      `**${p.name}** \`${p.id}\`\n` +
      `${formatPrice(p.price, p.currency)} • ${formatStock(p)} • ${p.enabled ? '✅' : '❌'} ${p.hidden ? '🙈 Hidden' : ''}`,
  );

  return new EmbedBuilder()
    .setTitle(`🗂️ Products — ${category.name}`)
    .setDescription(lines.join('\n\n'))
    .setColor(STORE_COLOR)
    .setFooter({ text: `${products.length} product(s)` });
}

// ── Order Created ────────────────────────────────────────────────────────────

export function buildOrderCreatedEmbed(order: StoreOrder, channelId: string | undefined): EmbedBuilder {
  const channelRef = channelId ? `<#${channelId}>` : 'the order channel';
  return new EmbedBuilder()
    .setTitle('✅ Order Placed!')
    .setDescription(
      `Your order **${order.orderId}** has been created.\n\n` +
        `Head over to ${channelRef} to view your order details and wait for staff to confirm payment.\n\n` +
        `Thank you for your purchase!`,
    )
    .setColor(SUCCESS_COLOR)
    .setFooter({ text: `Order ID: ${order.orderId}` })
    .setTimestamp();
}
