// ─────────────────────────────────────────────────────────────────────────────
// Order Manager — creates orders and manages their full lifecycle.
// Phase 2 additions: timeline entries, payment proof, coupon discounts,
// variant selection, delivery notes, and pinned-message tracking.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ChannelType,
  PermissionsBitField,
  type Client,
  type Guild,
  type TextChannel,
  type OverwriteResolvable,
} from 'discord.js';
import type {
  StoreOrder,
  StoreProduct,
  OrderStatus,
  OrdersData,
  OrderTimelineEntry,
  PaymentProof,
  ProofReviewDecision,
  DeliveryNote,
} from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';
import { settingsManager } from './settings-manager.js';
import { statisticsManager } from './statistics-manager.js';
import { logger } from '../../utils/logger.js';

const store = new StoreJson<OrdersData>('orders.json', () => ({ orders: [], counter: 0 }));

const ORDER_CATEGORY_NAME = 'Store Orders';

function normalizeOrder(o: Partial<StoreOrder> & { orderId: string; userId: string; productId: string }): StoreOrder {
  return {
    guildId: '',
    ticketId: '',
    quantity: 1,
    price: 0,
    totalPrice: 0,
    status: 'WaitingPayment',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    discountAmount: 0,
    originalPrice: (o as StoreOrder).totalPrice ?? 0,
    timeline: [],
    deliveryNotes: [],
    ...o,
  };
}

async function nextOrderId(): Promise<string> {
  return store.mutate(data => {
    data.counter += 1;
    return `STORE-${String(data.counter).padStart(6, '0')}`;
  });
}

async function resolveOrderCategory(guild: Guild): Promise<string | undefined> {
  const settings = await settingsManager.read();

  if (settings.orderCategoryId) {
    const existing = guild.channels.cache.get(settings.orderCategoryId);
    if (existing?.type === ChannelType.GuildCategory) return settings.orderCategoryId;
  }

  const found = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === ORDER_CATEGORY_NAME.toLowerCase(),
  );
  if (found) {
    await settingsManager.update({ orderCategoryId: found.id });
    return found.id;
  }

  try {
    const created = await guild.channels.create({
      name: ORDER_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
    });
    await settingsManager.update({ orderCategoryId: created.id });
    logger.success(`[Store] Created "${ORDER_CATEGORY_NAME}" category: ${created.id}`);
    return created.id;
  } catch (err) {
    logger.error('[Store] Failed to create Store Orders category', err);
    return undefined;
  }
}

async function createOrderChannel(
  guild: Guild,
  orderId: string,
  userId: string,
): Promise<TextChannel | undefined> {
  const settings = await settingsManager.read();
  const categoryId = await resolveOrderCategory(guild);
  const botMember = guild.members.me;

  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: userId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
      deny: [PermissionsBitField.Flags.SendMessages],
    },
  ];

  if (botMember) {
    overwrites.push({
      id: botMember.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles,
      ],
    });
  }

  const staffRoleIds = [...new Set([...settings.supportRoles, ...settings.adminRoles])];
  for (const roleId of staffRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      overwrites.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
        ],
      });
    }
  }

  const channelName = orderId.toLowerCase();
  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
      topic: `Store Order ${orderId} — <@${userId}>`,
    });
    return channel as TextChannel;
  } catch (err) {
    logger.error('[Store] Failed to create order channel', err);
    return undefined;
  }
}

export const orderManager = {
  /** Optional: inject a Discord Client for user tag resolution. */
  client: undefined as Client | undefined,

  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async getAll(): Promise<StoreOrder[]> {
    const data = await store.read();
    return data.orders.map(normalizeOrder);
  },

  async getByUser(userId: string): Promise<StoreOrder[]> {
    const data = await store.read();
    return data.orders
      .filter(o => o.userId === userId)
      .map(normalizeOrder)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async getById(orderId: string): Promise<StoreOrder | undefined> {
    const data = await store.read();
    const o = data.orders.find(x => x.orderId === orderId);
    return o ? normalizeOrder(o) : undefined;
  },

  async getByChannel(channelId: string): Promise<StoreOrder | undefined> {
    const data = await store.read();
    const o = data.orders.find(x => x.ticketId === channelId);
    return o ? normalizeOrder(o) : undefined;
  },

  async getByStatus(status: OrderStatus): Promise<StoreOrder[]> {
    const data = await store.read();
    return data.orders
      .filter(o => o.status === status)
      .map(normalizeOrder)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async countByUser(userId: string): Promise<number> {
    const data = await store.read();
    return data.orders.filter(o => o.userId === userId && o.status !== 'Cancelled' && o.status !== 'Refunded').length;
  },

  /**
   * Create a new order, open a Discord channel for it, and persist everything.
   */
  async create(
    guild: Guild,
    product: StoreProduct,
    userId: string,
    quantity: number,
    options?: {
      variantId?: string;
      paymentMethodId?: string;
      couponId?: string;
      discountAmount?: number;
    },
  ): Promise<{ order: StoreOrder; channel: TextChannel | undefined }> {
    const orderId = await nextOrderId();
    const originalPrice = product.price * quantity;
    const discountAmount = options?.discountAmount ?? 0;
    const totalPrice = Math.max(0, originalPrice - discountAmount);

    const channel = await createOrderChannel(guild, orderId, userId);

    const now = Date.now();
    const firstTimelineEntry: OrderTimelineEntry = {
      status: 'WaitingPayment',
      timestamp: now,
      note: 'Order placed',
    };

    const order: StoreOrder = {
      orderId,
      userId,
      guildId: guild.id,
      ticketId: channel?.id ?? '',
      productId: product.id,
      quantity,
      price: product.price,
      totalPrice,
      originalPrice,
      discountAmount,
      status: 'WaitingPayment',
      createdAt: now,
      updatedAt: now,
      variantId: options?.variantId,
      paymentMethodId: options?.paymentMethodId,
      couponId: options?.couponId,
      timeline: [firstTimelineEntry],
      deliveryNotes: [],
    };

    await store.mutate(data => {
      data.orders.push(order);
    });

    await statisticsManager.increment('totalOrders');
    await statisticsManager.increment('pending');
    await statisticsManager.trackCustomer(userId);

    logger.success(`[Store] Order created: ${orderId} by ${userId}`);
    return { order, channel };
  },

  /**
   * Update an order's status and append a timeline entry.
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    staffId?: string,
    reason?: string,
    note?: string,
  ): Promise<StoreOrder | undefined> {
    let prevStatus: OrderStatus | undefined;

    const order = await store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found) return undefined;
      prevStatus = found.status;
      found.status = status;
      found.updatedAt = Date.now();
      if (staffId !== undefined) found.staffId = staffId;

      // Append timeline entry
      if (!found.timeline) found.timeline = [];
      const entry: OrderTimelineEntry = {
        status,
        timestamp: Date.now(),
        staffId,
        reason,
        note,
      };
      found.timeline.push(entry);

      return JSON.parse(JSON.stringify(normalizeOrder(found))) as StoreOrder;
    });

    if (order && prevStatus !== undefined) {
      await statisticsManager.onStatusChange(prevStatus, status, order.totalPrice, order.staffId);
    }

    return order;
  },

  // ── Notes (legacy compat) ──────────────────────────────────────────────────

  async updateNotes(orderId: string, notes: string): Promise<StoreOrder | undefined> {
    return store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found) return undefined;
      found.notes = notes;
      found.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(normalizeOrder(found))) as StoreOrder;
    });
  },

  // ── Payment proof ──────────────────────────────────────────────────────────

  async submitProof(orderId: string, proof: Omit<PaymentProof, 'reviewedAt' | 'reviewedBy' | 'reviewDecision' | 'reviewNotes'>): Promise<StoreOrder | undefined> {
    return store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found) return undefined;
      found.proof = { ...proof };
      found.updatedAt = Date.now();
      if (!found.timeline) found.timeline = [];
      found.timeline.push({ status: 'ProofSubmitted', timestamp: Date.now(), note: 'Payment proof submitted by buyer' });
      return JSON.parse(JSON.stringify(normalizeOrder(found))) as StoreOrder;
    });
  },

  async reviewProof(
    orderId: string,
    staffId: string,
    decision: ProofReviewDecision,
    reviewNotes?: string,
  ): Promise<StoreOrder | undefined> {
    return store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found?.proof) return undefined;
      found.proof.reviewedAt = Date.now();
      found.proof.reviewedBy = staffId;
      found.proof.reviewDecision = decision;
      found.proof.reviewNotes = reviewNotes;
      found.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(normalizeOrder(found))) as StoreOrder;
    });
  },

  // ── Delivery notes ─────────────────────────────────────────────────────────

  async addDeliveryNote(
    orderId: string,
    staffId: string,
    content: string,
    options?: { attachmentUrls?: string[]; characterName?: string; serverNotes?: string; isPrivate?: boolean },
  ): Promise<DeliveryNote | undefined> {
    return store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found) return undefined;
      if (!found.deliveryNotes) found.deliveryNotes = [];
      const note: DeliveryNote = {
        id: genStoreId('dn'),
        staffId,
        content,
        attachmentUrls: options?.attachmentUrls ?? [],
        characterName: options?.characterName,
        serverNotes: options?.serverNotes,
        isPrivate: options?.isPrivate ?? false,
        timestamp: Date.now(),
      };
      found.deliveryNotes.push(note);
      found.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(note)) as DeliveryNote;
    });
  },

  // ── Pinned message tracking ────────────────────────────────────────────────

  async setPinnedMessageId(orderId: string, messageId: string): Promise<void> {
    await store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (found) {
        found.pinnedMessageId = messageId;
        found.updatedAt = Date.now();
      }
    });
  },

  // ── Coupon support ─────────────────────────────────────────────────────────

  async applyCoupon(orderId: string, couponId: string, discountAmount: number): Promise<StoreOrder | undefined> {
    return store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found) return undefined;
      found.couponId = couponId;
      found.discountAmount = discountAmount;
      found.totalPrice = Math.max(0, found.originalPrice - discountAmount);
      found.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(normalizeOrder(found))) as StoreOrder;
    });
  },

  // ── Payment method ─────────────────────────────────────────────────────────

  async setPaymentMethod(orderId: string, paymentMethodId: string): Promise<StoreOrder | undefined> {
    return store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found) return undefined;
      found.paymentMethodId = paymentMethodId;
      found.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(normalizeOrder(found))) as StoreOrder;
    });
  },
};
