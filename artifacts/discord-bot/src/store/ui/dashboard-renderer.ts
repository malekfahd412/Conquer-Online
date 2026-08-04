// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Renderer — admin store dashboard and customer order dashboard.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type {
  StoreStatistics,
  StoreOrder,
  StoreProduct,
  OrderStatus,
} from '../models/index.js';
import { STATUS_LABELS, STATUS_ICONS, STATUS_COLORS } from './timeline-renderer.js';

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

const STORE_COLOR = 0xf5a623;

function bar(filled: number, total: number, width = 10): string {
  if (total === 0) return '░'.repeat(width);
  const filledCount = Math.round((filled / total) * width);
  return '█'.repeat(filledCount) + '░'.repeat(width - filledCount);
}

function formatRevenue(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return String(amount);
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────

export function buildAdminDashboardEmbed(stats: StoreStatistics): EmbedBuilder {
  const total = stats.totalOrders || 1;

  const completedPct = Math.round((stats.completed / total) * 100);
  const cancelledPct = Math.round((stats.cancelled / total) * 100);

  // Revenue trend (last 7 days)
  const last7Days: number[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7Days.push(stats.dailyRevenue[key] ?? 0);
  }
  const maxDay = Math.max(...last7Days, 1);
  const revenueChart = last7Days
    .map(v => {
      const height = Math.round((v / maxDay) * 5);
      return ['▁', '▂', '▃', '▄', '▅', '▆'][height] ?? '▁';
    })
    .join('');

  return new EmbedBuilder()
    .setTitle('📊 Store Admin Dashboard')
    .setColor(STORE_COLOR)
    .addFields(
      { name: '📋 Total Orders', value: String(stats.totalOrders), inline: true },
      { name: '⏳ Pending', value: String(stats.pending), inline: true },
      { name: '📎 Proof Review', value: String(stats.proofSubmitted ?? 0), inline: true },
      { name: '✅ Completed', value: `${stats.completed} (${completedPct}%)`, inline: true },
      { name: '❌ Cancelled', value: `${stats.cancelled} (${cancelledPct}%)`, inline: true },
      { name: '💸 Refunded', value: String(stats.refunded ?? 0), inline: true },
      { name: '📦 Delivering', value: String(stats.delivering ?? 0), inline: true },
      { name: '⚙️ Preparing', value: String(stats.preparing ?? 0), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: '💰 Total Revenue',
        value: `**${formatRevenue(stats.revenue)}**\n${bar(stats.completed, total)} ${completedPct}% fill rate`,
        inline: false,
      },
      {
        name: '📈 Revenue Trend (7 days)',
        value: `\`${revenueChart}\`\nToday: **${formatRevenue(last7Days[6] ?? 0)}** | This week: **${formatRevenue(last7Days.reduce((s, v) => s + v, 0))}**`,
        inline: false,
      },
    )
    .setFooter({ text: 'Admin Dashboard • Store Management System Phase 2' })
    .setTimestamp();
}

export function buildAdminDashboardComponents(): AnyRow[] {
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:dash:orders')
      .setLabel('View Orders')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('st:dash:products')
      .setLabel('Products')
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:dash:topstats')
      .setLabel('Top Stats')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:dash:export')
      .setLabel('Export')
      .setEmoji('📥')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:dash:refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row1];
}

export function buildTopStatsEmbed(
  stats: StoreStatistics,
  topProductNames: Map<string, string>,
  topStaffNames: Map<string, string>,
  topCustomerNames: Map<string, string>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🏆 Top Statistics')
    .setColor(STORE_COLOR);

  // Top products by revenue
  const topProducts = Object.entries(stats.topProducts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (topProducts.length > 0) {
    const lines = topProducts.map(([id, rev], i) => {
      const name = topProductNames.get(id) ?? `Product (${id.slice(-4)})`;
      return `${i + 1}. **${name}** — ${formatRevenue(rev)}`;
    });
    embed.addFields({ name: '🎁 Top Products (by revenue)', value: lines.join('\n'), inline: false });
  }

  // Top staff
  const topStaff = Object.entries(stats.topStaff)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (topStaff.length > 0) {
    const lines = topStaff.map(([id, count], i) => {
      const name = topStaffNames.get(id) ?? `<@${id}>`;
      return `${i + 1}. ${name} — ${count} order${count !== 1 ? 's' : ''}`;
    });
    embed.addFields({ name: '👮 Top Staff', value: lines.join('\n'), inline: true });
  }

  // Top customers
  const topCustomers = Object.entries(stats.topCustomers)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (topCustomers.length > 0) {
    const lines = topCustomers.map(([id, count], i) => {
      const name = topCustomerNames.get(id) ?? `<@${id}>`;
      return `${i + 1}. ${name} — ${count} order${count !== 1 ? 's' : ''}`;
    });
    embed.addFields({ name: '👤 Top Customers', value: lines.join('\n'), inline: true });
  }

  embed.setTimestamp();
  return embed;
}

export function buildRevenueChartEmbed(stats: StoreStatistics): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📈 Revenue Charts')
    .setColor(STORE_COLOR);

  // Monthly revenue (last 6 months)
  const monthlyEntries = Object.entries(stats.monthlyRevenue)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6);

  if (monthlyEntries.length > 0) {
    const maxMonthly = Math.max(...monthlyEntries.map(([, v]) => v), 1);
    const chart = monthlyEntries.map(([month, rev]) => {
      const pct = rev / maxMonthly;
      const height = Math.round(pct * 5);
      const bar2 = ['▁', '▂', '▃', '▄', '▅', '▆'][height] ?? '▁';
      return `${bar2} ${month.slice(5)}: **${formatRevenue(rev)}**`;
    });
    embed.addFields({ name: '📅 Monthly Revenue (last 6 months)', value: chart.join('\n'), inline: false });
  }

  embed.setTimestamp();
  return embed;
}

// ── Customer Dashboard ────────────────────────────────────────────────────────

export function buildCustomerDashboardEmbed(
  userId: string,
  orders: StoreOrder[],
  products: StoreProduct[],
): EmbedBuilder {
  if (orders.length === 0) {
    return new EmbedBuilder()
      .setTitle('📦 My Orders')
      .setDescription("*You haven't placed any orders yet.*\n\nUse **Browse Store** to find something!")
      .setColor(STORE_COLOR);
  }

  const productMap = new Map(products.map(p => [p.id, p]));

  const statusGroups: Partial<Record<OrderStatus, StoreOrder[]>> = {};
  for (const order of orders) {
    if (!statusGroups[order.status]) statusGroups[order.status] = [];
    statusGroups[order.status]!.push(order);
  }

  const activeOrders = orders.filter(o => !['Completed', 'Cancelled', 'Refunded'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'Completed');
  const totalSpent = orders
    .filter(o => o.status === 'Completed')
    .reduce((s, o) => s + o.totalPrice, 0);

  const embed = new EmbedBuilder()
    .setTitle('📦 My Orders Dashboard')
    .setColor(STORE_COLOR)
    .addFields(
      { name: '📊 Total Orders', value: String(orders.length), inline: true },
      { name: '🔄 Active', value: String(activeOrders.length), inline: true },
      { name: '✅ Completed', value: String(completedOrders.length), inline: true },
    );

  if (totalSpent > 0) {
    embed.addFields({ name: '💰 Total Spent', value: String(totalSpent), inline: true });
  }

  // Recent orders
  const recentOrders = orders.slice(0, 5);
  const lines = recentOrders.map(o => {
    const product = productMap.get(o.productId);
    const name = product?.name ?? 'Unknown Product';
    const icon = STATUS_ICONS[o.status] ?? '📋';
    const statusLabel = STATUS_LABELS[o.status] ?? o.status;
    return `${icon} **${o.orderId}** — ${name}\n  ${statusLabel} • <t:${Math.floor(o.createdAt / 1000)}:R>`;
  });
  embed.addFields({ name: '🕐 Recent Orders', value: lines.join('\n\n'), inline: false });

  void userId;
  embed.setFooter({ text: orders.length > 5 ? `Showing 5 of ${orders.length} orders` : `${orders.length} total order(s)` });
  return embed;
}

export function buildCustomerDashboardComponents(): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:cust:active')
      .setLabel('Active Orders')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('st:cust:history')
      .setLabel('Order History')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:cust:refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

export function buildOrderDetailEmbed(
  order: StoreOrder,
  product: StoreProduct | undefined,
): EmbedBuilder {
  const statusColor = STATUS_COLORS[order.status] ?? STORE_COLOR;
  const statusIcon = STATUS_ICONS[order.status] ?? '📋';
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  const embed = new EmbedBuilder()
    .setTitle(`🧾 Order ${order.orderId}`)
    .setColor(statusColor)
    .addFields(
      { name: '📊 Status', value: `${statusIcon} ${statusLabel}`, inline: true },
      { name: '🎁 Product', value: product?.name ?? 'Unknown', inline: true },
      { name: '📊 Qty', value: String(order.quantity), inline: true },
      {
        name: '💰 Total',
        value: `**${order.totalPrice.toLocaleString()} ${product?.currency ?? ''}**`,
        inline: true,
      },
      { name: '📅 Ordered', value: `<t:${Math.floor(order.createdAt / 1000)}:F>`, inline: true },
      { name: '🕐 Updated', value: `<t:${Math.floor(order.updatedAt / 1000)}:R>`, inline: true },
    );

  if (order.discountAmount > 0) {
    embed.addFields({
      name: '🎉 Discount Applied',
      value: `-${order.discountAmount.toLocaleString()} ${product?.currency ?? ''}`,
      inline: true,
    });
  }

  if (order.notes) embed.addFields({ name: '📝 Staff Notes', value: order.notes });

  const timeline = (order.timeline ?? []).slice(-3);
  if (timeline.length > 0) {
    const tLines = timeline.map(e => {
      const icon = STATUS_ICONS[e.status] ?? '•';
      return `${icon} ${STATUS_LABELS[e.status] ?? e.status} — <t:${Math.floor(e.timestamp / 1000)}:R>`;
    });
    embed.addFields({ name: '📅 Recent Timeline', value: tLines.join('\n') });
  }

  if (product?.image) embed.setThumbnail(product.image);

  embed.setFooter({ text: `Order ID: ${order.orderId}` }).setTimestamp(order.updatedAt);
  return embed;
}

export function buildOrderDetailComponents(order: StoreOrder): AnyRow[] {
  const rows: AnyRow[] = [];
  const terminal = ['Completed', 'Cancelled', 'Refunded'].includes(order.status);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:cust:timeline:${order.orderId}`)
      .setLabel('Full Timeline')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`st:cust:receipt:${order.orderId}`)
      .setLabel('Download Receipt')
      .setEmoji('🧾')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:cust:back')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );

  if (!terminal && order.status === 'WaitingPayment') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`st:pm:show:${order.orderId}`)
        .setLabel('Pay Now')
        .setEmoji('💳')
        .setStyle(ButtonStyle.Success),
    );
  }

  rows.push(row);
  return rows;
}
