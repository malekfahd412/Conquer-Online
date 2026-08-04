// ─────────────────────────────────────────────────────────────────────────────
// Store Renderer — builds all embeds and Discord components for the store UI.
// Phase 2 additions: variant selection, search results, product badges,
// gallery previews, scheduled products, and special offer indicators.
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
  ProductVariant,
} from '../models/index.js';

// ── Colour palette ────────────────────────────────────────────────────────────
const STORE_COLOR = 0xf5a623;
const SUCCESS_COLOR = 0x57f287;

const STATUS_COLORS: Record<OrderStatus, number> = {
  Pending: 0xfee75c,
  WaitingPayment: 0xffd700,
  ProofSubmitted: 0xffa500,
  Paid: 0x57f287,
  Preparing: 0x00b0f4,
  Delivering: 0x5865f2,
  Completed: 0x00d26a,
  Cancelled: 0xed4245,
  Refunded: 0x8e8e93,
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: '📋 Pending',
  WaitingPayment: '⏳ Waiting Payment',
  ProofSubmitted: '📎 Proof Submitted',
  Paid: '✅ Payment Approved',
  Preparing: '⚙️ Preparing',
  Delivering: '📦 Delivering',
  Completed: '✅ Completed',
  Cancelled: '❌ Cancelled',
  Refunded: '💸 Refunded',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatPrice(price: number, currency: string): string {
  return `${price.toLocaleString()} ${currency}`;
}

function formatStock(product: StoreProduct): string {
  if (product.unlimitedStock) return '♾️ Unlimited';
  if (product.stock === 0) return '❌ Out of Stock';
  const threshold = product.lowStockThreshold ?? 0;
  if (threshold > 0 && product.stock <= threshold) return `⚠️ Low Stock (${product.stock})`;
  return `✅ ${product.stock} in stock`;
}

function getBadgeString(product: StoreProduct): string {
  const badgeMap: Record<string, string> = {
    new: '🆕',
    popular: '🔥',
    best_seller: '⭐',
    sale: '🏷️',
    limited: '⏰',
  };
  return (product.badges ?? []).map(b => badgeMap[b] ?? '').filter(Boolean).join(' ');
}

function isScheduled(product: StoreProduct): boolean {
  return product.scheduledAt !== undefined && product.scheduledAt > Date.now();
}

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

// ── Store Panel ───────────────────────────────────────────────────────────────

export function buildStorePanelEmbed(serverName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🏪 Official Store')
    .setDescription(
      `Welcome to the **${serverName}** store!\n\n` +
        'Browse our collection of in-game items, currency, cosmetics, and services.\n\n' +
        '> 🛒 **Browse Store** — Explore products\n' +
        '> 🔍 **Search** — Find a specific item\n' +
        '> 📦 **My Orders** — View your order history\n' +
        '> 🎟️ **Coupons** — Apply a discount code\n' +
        '> 🎫 **Support** — Get help with your order',
    )
    .setColor(STORE_COLOR)
    .setFooter({ text: `${serverName} Store • Powered by Mufasa Bot` })
    .setTimestamp();
}

export function buildStorePanelComponents(): AnyRow[] {
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:panel:browse')
      .setLabel('Browse Store')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('st:panel:search')
      .setLabel('Search')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary),
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
  return [row1];
}

// ── Category Browser ──────────────────────────────────────────────────────────

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

// ── Product Browser ───────────────────────────────────────────────────────────

export function buildProductSelectEmbed(category: StoreCategory, products: StoreProduct[]): EmbedBuilder {
  const desc =
    products.length === 0
      ? '*No products are available in this category right now.*'
      : products
          .map(p => {
            const badges = getBadgeString(p);
            const badgeStr = badges ? ` ${badges}` : '';
            const hasVariants = (p.variants ?? []).filter(v => v.enabled).length > 0;
            const variantStr = hasVariants ? ' *(variants available)*' : '';
            return (
              `**${p.name}**${badgeStr} — ${formatPrice(p.price, p.currency)}${variantStr}\n` +
              `${p.description.slice(0, 80)}${p.description.length > 80 ? '…' : ''}`
            );
          })
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
        products.slice(0, 25).map(p => {
          const badges = getBadgeString(p);
          const label = badges ? `${badges} ${p.name}` : p.name;
          return new StringSelectMenuOptionBuilder()
            .setValue(p.id)
            .setLabel(label.slice(0, 100))
            .setDescription(`${formatPrice(p.price, p.currency)} • ${formatStock(p)}`);
        }),
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

// ── Product Detail Page ───────────────────────────────────────────────────────

export function buildProductPageEmbed(product: StoreProduct, category: StoreCategory, flashSaleDiscount = 0): EmbedBuilder {
  const badges = getBadgeString(product);
  const title = badges ? `${badges} ${product.name}` : product.name;

  const effectivePrice = flashSaleDiscount > 0
    ? Math.floor(product.price * (1 - flashSaleDiscount / 100))
    : product.price;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(product.description)
    .setColor(STORE_COLOR)
    .addFields(
      {
        name: '💰 Price',
        value: flashSaleDiscount > 0
          ? `~~${formatPrice(product.price, product.currency)}~~ **${formatPrice(effectivePrice, product.currency)}** (-${flashSaleDiscount}% 🔥)`
          : formatPrice(product.price, product.currency),
        inline: true,
      },
      { name: '📦 Stock', value: formatStock(product), inline: true },
      { name: '🗂️ Category', value: `${category.emoji} ${category.name}`, inline: true },
    )
    .setFooter({ text: `Product ID: ${product.id}` })
    .setTimestamp(product.updatedAt);

  // Tags
  const tags = product.tags ?? [];
  if (tags.length > 0) {
    embed.addFields({ name: '🏷️ Tags', value: tags.map(t => `\`${t}\``).join(' '), inline: true });
  }

  // Variants
  const enabledVariants = (product.variants ?? []).filter(v => v.enabled);
  if (enabledVariants.length > 0) {
    const variantStr = enabledVariants
      .slice(0, 5)
      .map(v => `• **${v.name}** — ${formatPrice(v.price, product.currency)}${v.unlimitedStock ? ' ♾️' : v.stock > 0 ? ` (${v.stock})` : ' ❌'}`)
      .join('\n');
    embed.addFields({ name: '🔀 Variants', value: variantStr, inline: false });
  }

  // Main image or first gallery image
  const mainImage = product.image ?? product.galleryImages?.[0];
  if (mainImage) embed.setImage(mainImage);

  // Thumbnail
  if (product.thumbnail) embed.setThumbnail(product.thumbnail);

  return embed;
}

export function buildProductPageComponents(product: StoreProduct, categoryId: string): AnyRow[] {
  const inStock = product.unlimitedStock || product.stock > 0;
  const enabledVariants = (product.variants ?? []).filter(v => v.enabled);
  const hasVariants = enabledVariants.length > 0;

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(hasVariants ? `st:var:select:${product.id}` : `st:product:buy:${product.id}`)
      .setLabel(hasVariants ? 'Choose Variant' : 'Buy Now')
      .setEmoji(hasVariants ? '🔀' : '🛒')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!inStock),
    new ButtonBuilder()
      .setCustomId(`st:product:back:${categoryId}`)
      .setLabel('← Back to Products')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row];
}

// ── Variant Selection ─────────────────────────────────────────────────────────

export function buildVariantSelectEmbed(product: StoreProduct): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`🔀 Select Variant — ${product.name}`)
    .setDescription('Choose the variant you would like to purchase:')
    .setColor(STORE_COLOR)
    .setFooter({ text: 'Select a variant below' });
}

export function buildVariantSelectComponents(product: StoreProduct): AnyRow[] {
  const enabledVariants = (product.variants ?? []).filter(v => v.enabled);
  if (enabledVariants.length === 0) return [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`st:var:pick:${product.id}`)
    .setPlaceholder('Choose a variant…')
    .addOptions(
      enabledVariants.slice(0, 25).map(v =>
        new StringSelectMenuOptionBuilder()
          .setValue(v.id)
          .setLabel(v.name)
          .setDescription(
            `${formatPrice(v.price, product.currency)} • ${v.unlimitedStock ? '♾️ Unlimited' : v.stock > 0 ? `${v.stock} in stock` : '❌ Out of stock'}`,
          ),
      ),
    );

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:product:back:${product.categoryId}`)
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

// ── Quantity Modal ────────────────────────────────────────────────────────────

export function buildQuantityModal(productId: string, productName: string, variantId?: string): ModalBuilder {
  const customId = variantId ? `st:modal:qty:${productId}:${variantId}` : `st:modal:qty:${productId}`;
  return new ModalBuilder()
    .setCustomId(customId)
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

// ── Order Confirmation ────────────────────────────────────────────────────────

export function buildConfirmEmbed(
  product: StoreProduct,
  category: StoreCategory,
  quantity: number,
  variant?: ProductVariant,
  flashSaleDiscount = 0,
): EmbedBuilder {
  const basePrice = variant?.price ?? product.price;
  const discountedPrice = flashSaleDiscount > 0
    ? Math.floor(basePrice * (1 - flashSaleDiscount / 100))
    : basePrice;
  const total = discountedPrice * quantity;

  const embed = new EmbedBuilder()
    .setTitle('🛒 Confirm Your Purchase')
    .setColor(STORE_COLOR)
    .addFields(
      { name: '🎁 Product', value: product.name, inline: true },
      { name: '🗂️ Category', value: `${category.emoji} ${category.name}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📊 Quantity', value: String(quantity), inline: true },
      {
        name: '💰 Unit Price',
        value: flashSaleDiscount > 0
          ? `~~${formatPrice(basePrice, product.currency)}~~ **${formatPrice(discountedPrice, product.currency)}**`
          : formatPrice(discountedPrice, product.currency),
        inline: true,
      },
      { name: '🧾 Total', value: `**${formatPrice(total, product.currency)}**`, inline: true },
    )
    .setFooter({ text: 'Press Confirm to place your order' });

  if (variant) {
    embed.addFields({ name: '🔀 Variant', value: variant.name, inline: true });
  }
  if (flashSaleDiscount > 0) {
    embed.addFields({ name: '🔥 Flash Sale', value: `-${flashSaleDiscount}%`, inline: true });
  }
  if (product.thumbnail ?? product.image) {
    embed.setThumbnail((product.thumbnail ?? product.image)!);
  }

  return embed;
}

export function buildConfirmComponents(productId: string, quantity: number, variantId?: string): AnyRow[] {
  const confirmId = variantId
    ? `st:confirm:yes:${productId}:${quantity}:${variantId}`
    : `st:confirm:yes:${productId}:${quantity}`;

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel('Confirm Purchase')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`st:cp:enter:${productId}:${quantity}`)
      .setLabel('Apply Coupon')
      .setEmoji('🎟️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:confirm:no')
      .setLabel('Cancel')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

// ── Search ────────────────────────────────────────────────────────────────────

export function buildSearchModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('st:modal:search')
    .setTitle('Search the Store')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Search Query')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder('Product name, tag, category, or ID…'),
      ),
    );
}

export function buildSearchResultsEmbed(query: string, products: StoreProduct[], categories: Map<string, StoreCategory>): EmbedBuilder {
  if (products.length === 0) {
    return new EmbedBuilder()
      .setTitle(`🔍 Search: "${query}"`)
      .setDescription('*No products found matching your search.*')
      .setColor(STORE_COLOR);
  }

  const lines = products.slice(0, 10).map(p => {
    const category = categories.get(p.categoryId);
    const catStr = category ? `${category.emoji} ${category.name}` : 'Unknown';
    const badges = getBadgeString(p);
    const badgeStr = badges ? ` ${badges}` : '';
    return (
      `**${p.name}**${badgeStr} — ${formatPrice(p.price, p.currency)}\n` +
      `${catStr} • ${formatStock(p)}\n` +
      `\`${p.id}\``
    );
  });

  return new EmbedBuilder()
    .setTitle(`🔍 Search: "${query}"`)
    .setDescription(lines.join('\n\n'))
    .setColor(STORE_COLOR)
    .setFooter({ text: products.length > 10 ? `Showing 10 of ${products.length} results` : `${products.length} result(s)` });
}

export function buildSearchResultComponents(products: StoreProduct[]): AnyRow[] {
  if (products.length === 0) return [];

  const rows: AnyRow[] = [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId('st:search:select')
    .setPlaceholder('Select a product to view…')
    .addOptions(
      products.slice(0, 25).map(p =>
        new StringSelectMenuOptionBuilder()
          .setValue(p.id)
          .setLabel(p.name.slice(0, 100))
          .setDescription(`${formatPrice(p.price, p.currency)} • ${formatStock(p)}`),
      ),
    );
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('st:panel:browse')
        .setLabel('← Browse Categories')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('st:panel:search')
        .setLabel('New Search')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

// ── Order Channel Embed (Phase 1 compat) ─────────────────────────────────────

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

  if (order.discountAmount > 0) {
    embed.addFields({ name: '🎉 Discount', value: `-${formatPrice(order.discountAmount, product.currency)}`, inline: true });
  }
  if (order.staffId) {
    embed.addFields({ name: '👮 Handled By', value: `<@${order.staffId}>`, inline: true });
  }
  if (order.notes) {
    embed.addFields({ name: '📝 Notes', value: order.notes });
  }
  if (product.thumbnail ?? product.image) {
    embed.setThumbnail((product.thumbnail ?? product.image)!);
  }

  return embed;
}

export function buildOrderComponents(order: StoreOrder): AnyRow[] {
  const terminalStatuses: OrderStatus[] = ['Completed', 'Cancelled', 'Refunded'];
  if (terminalStatuses.includes(order.status)) return [];

  const buttons: ButtonBuilder[] = [];

  if (order.status === 'WaitingPayment' || order.status === 'Pending') {
    buttons.push(
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
  }

  if (order.status === 'ProofSubmitted') {
    buttons.push(
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
    );
  }

  if (order.status === 'Paid') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`st:order:prepare:${order.orderId}`)
        .setLabel('Start Preparing')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Primary),
    );
  }

  if (order.status === 'Preparing') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`st:order:deliver:${order.orderId}`)
        .setLabel('Start Delivery')
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

// ── My Orders ─────────────────────────────────────────────────────────────────

export function buildMyOrdersEmbed(orders: StoreOrder[], products: StoreProduct[]): EmbedBuilder {
  if (orders.length === 0) {
    return new EmbedBuilder()
      .setTitle('📦 My Orders')
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

export function buildMyOrdersComponents(orders: StoreOrder[]): AnyRow[] {
  const rows: AnyRow[] = [];

  if (orders.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('st:myorders:select')
      .setPlaceholder('Select an order to view details…')
      .addOptions(
        orders.slice(0, 25).map(o =>
          new StringSelectMenuOptionBuilder()
            .setValue(o.orderId)
            .setLabel(o.orderId)
            .setDescription(`${STATUS_LABELS[o.status]} • <t:${Math.floor(o.createdAt / 1000)}:d>`),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('st:panel:browse')
        .setLabel('Browse Store')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Primary),
    ),
  );

  return rows;
}

// ── Admin: Statistics ─────────────────────────────────────────────────────────

export function buildStatsEmbed(stats: StoreStatistics): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📊 Store Statistics')
    .setColor(STORE_COLOR)
    .addFields(
      { name: '📋 Total Orders', value: String(stats.totalOrders), inline: true },
      { name: '⏳ Pending', value: String(stats.pending), inline: true },
      { name: '📎 Proof Review', value: String(stats.proofSubmitted ?? 0), inline: true },
      { name: '✅ Completed', value: String(stats.completed), inline: true },
      { name: '❌ Cancelled', value: String(stats.cancelled), inline: true },
      { name: '💸 Refunded', value: String(stats.refunded ?? 0), inline: true },
      { name: '📦 Delivering', value: String(stats.delivering ?? 0), inline: true },
      { name: '⚙️ Preparing', value: String(stats.preparing ?? 0), inline: true },
      { name: '💰 Total Revenue', value: String(stats.revenue), inline: true },
    )
    .setTimestamp();
}

// ── Admin: Category List ──────────────────────────────────────────────────────

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

// ── Admin: Product List ───────────────────────────────────────────────────────

export function buildProductListEmbed(products: StoreProduct[], category: StoreCategory): EmbedBuilder {
  if (products.length === 0) {
    return new EmbedBuilder()
      .setTitle(`🗂️ Products — ${category.name}`)
      .setDescription('*No products in this category. Use `/store product add` to create one.*')
      .setColor(STORE_COLOR);
  }

  const lines = products.map(p => {
    const badges = getBadgeString(p);
    const scheduled = isScheduled(p) ? ' ⏰' : '';
    return (
      `**${p.name}** ${badges}${scheduled} \`${p.id}\`\n` +
      `${formatPrice(p.price, p.currency)} • ${formatStock(p)} • ${p.enabled ? '✅' : '❌'} ${p.hidden ? '🙈 Hidden' : ''}` +
      ((p.variants ?? []).length > 0 ? ` • ${p.variants.length} variant(s)` : '')
    );
  });

  return new EmbedBuilder()
    .setTitle(`🗂️ Products — ${category.name}`)
    .setDescription(lines.join('\n\n'))
    .setColor(STORE_COLOR)
    .setFooter({ text: `${products.length} product(s)` });
}

// ── Order Created ─────────────────────────────────────────────────────────────

export function buildOrderCreatedEmbed(order: StoreOrder, channelId: string | undefined): EmbedBuilder {
  const channelRef = channelId ? `<#${channelId}>` : 'the order channel';
  return new EmbedBuilder()
    .setTitle('✅ Order Placed!')
    .setDescription(
      `Your order **${order.orderId}** has been created.\n\n` +
        `Head over to ${channelRef} to view your order details and complete payment.\n\n` +
        (order.discountAmount > 0
          ? `🎉 **Discount Applied:** -${order.discountAmount.toLocaleString()}\n**Final Total:** ${order.totalPrice.toLocaleString()}\n\n`
          : '') +
        `Thank you for your purchase!`,
    )
    .setColor(SUCCESS_COLOR)
    .setFooter({ text: `Order ID: ${order.orderId}` })
    .setTimestamp();
}

// ── Export receipt (text format) ──────────────────────────────────────────────

export function buildReceiptText(order: StoreOrder, product: StoreProduct | undefined, customerTag: string): string {
  const lines: string[] = [
    '═══════════════════════════════',
    `       STORE ORDER RECEIPT       `,
    '═══════════════════════════════',
    `Order ID:    ${order.orderId}`,
    `Date:        ${new Date(order.createdAt).toUTCString()}`,
    `Status:      ${order.status}`,
    '───────────────────────────────',
    `Customer:    ${customerTag} (${order.userId})`,
    `Product:     ${product?.name ?? 'Unknown'}`,
    `Quantity:    ${order.quantity}`,
    `Unit Price:  ${order.price.toLocaleString()} ${product?.currency ?? ''}`,
  ];

  if (order.discountAmount > 0) {
    lines.push(`Discount:    -${order.discountAmount.toLocaleString()} ${product?.currency ?? ''}`);
    lines.push(`Original:    ${order.originalPrice?.toLocaleString() ?? '?'} ${product?.currency ?? ''}`);
  }

  lines.push(`TOTAL:       ${order.totalPrice.toLocaleString()} ${product?.currency ?? ''}`);

  if (order.couponId) lines.push(`Coupon:      ${order.couponId}`);
  if (order.paymentMethodId) lines.push(`Payment:     ${order.paymentMethodId}`);
  if (order.staffId) lines.push(`Handled by:  ${order.staffId}`);

  lines.push('───────────────────────────────');

  if ((order.timeline ?? []).length > 0) {
    lines.push('Timeline:');
    for (const e of order.timeline) {
      const ts = new Date(e.timestamp).toUTCString();
      lines.push(`  [${e.status}] ${ts}${e.staffId ? ` (by ${e.staffId})` : ''}`);
    }
  }

  lines.push('═══════════════════════════════');
  lines.push('Powered by Mufasa Bot Store System');
  return lines.join('\n');
}
