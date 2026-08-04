// ─────────────────────────────────────────────────────────────────────────────
// Timeline Renderer — builds beautiful order timeline embeds.
// ─────────────────────────────────────────────────────────────────────────────
import { EmbedBuilder } from 'discord.js';
import type { StoreOrder, OrderTimelineEntry, OrderStatus } from '../models/index.js';

const STATUS_ICONS: Record<OrderStatus, string> = {
  Pending: '📋',
  WaitingPayment: '⏳',
  ProofSubmitted: '📎',
  Paid: '✅',
  Preparing: '⚙️',
  Delivering: '📦',
  Completed: '🎉',
  Cancelled: '❌',
  Refunded: '💸',
};

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
  Pending: 'Pending',
  WaitingPayment: 'Waiting Payment',
  ProofSubmitted: 'Proof Submitted',
  Paid: 'Payment Approved',
  Preparing: 'Preparing',
  Delivering: 'Delivering',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Refunded: 'Refunded',
};

/** Full order status flow in display order. */
const FLOW: OrderStatus[] = [
  'Pending',
  'WaitingPayment',
  'ProofSubmitted',
  'Paid',
  'Preparing',
  'Delivering',
  'Completed',
];

function formatTimelineEntry(entry: OrderTimelineEntry, isCurrent: boolean): string {
  const icon = STATUS_ICONS[entry.status] ?? '•';
  const label = STATUS_LABELS[entry.status] ?? entry.status;
  const time = `<t:${Math.floor(entry.timestamp / 1000)}:R>`;
  const marker = isCurrent ? '**' : '';

  let line = `${icon} ${marker}${label}${marker} — ${time}`;
  if (entry.staffId) line += `\n  ↳ by <@${entry.staffId}>`;
  if (entry.note) line += `\n  ↳ ${entry.note}`;
  if (entry.reason) line += `\n  ↳ Reason: ${entry.reason}`;

  return line;
}

export function buildTimelineEmbed(order: StoreOrder): EmbedBuilder {
  const timeline = order.timeline ?? [];
  const currentColor = STATUS_COLORS[order.status] ?? 0xf5a623;

  // Build visual progress bar
  const flowIndex = FLOW.indexOf(order.status);
  const progressParts = FLOW.map((status, i) => {
    const icon = STATUS_ICONS[status] ?? '○';
    if (order.status === 'Cancelled' || order.status === 'Refunded') {
      return `~~${icon}~~`;
    }
    if (i < flowIndex) return `~~${icon}~~`;
    if (i === flowIndex) return `**${icon}**`;
    return `${icon}`;
  });
  const progress = progressParts.join(' › ');

  let description = `**Progress:** ${progress}\n\n`;

  if (timeline.length === 0) {
    description += '*No timeline entries yet.*';
  } else {
    const entries = timeline
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);

    description += entries
      .map((e, i) => formatTimelineEntry(e, i === entries.length - 1))
      .join('\n\n');
  }

  return new EmbedBuilder()
    .setTitle(`📅 Order Timeline — ${order.orderId}`)
    .setDescription(description)
    .setColor(currentColor)
    .setFooter({ text: `Current status: ${STATUS_LABELS[order.status] ?? order.status}` })
    .setTimestamp(order.updatedAt);
}

export function buildCompactTimelineField(order: StoreOrder): { name: string; value: string; inline: boolean } {
  const timeline = (order.timeline ?? []).slice().sort((a, b) => a.timestamp - b.timestamp);
  if (timeline.length === 0) {
    return { name: '📅 Timeline', value: '*No events yet*', inline: false };
  }

  const lines = timeline.slice(-5).map(e => {
    const icon = STATUS_ICONS[e.status] ?? '•';
    const label = STATUS_LABELS[e.status] ?? e.status;
    const time = `<t:${Math.floor(e.timestamp / 1000)}:d>`;
    return `${icon} ${label} — ${time}`;
  });

  return {
    name: `📅 Timeline (${timeline.length} events)`,
    value: lines.join('\n'),
    inline: false,
  };
}

export { STATUS_COLORS, STATUS_LABELS, STATUS_ICONS };
