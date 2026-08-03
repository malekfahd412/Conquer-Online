// ─────────────────────────────────────────────────────────────────────────────
// Order Manager — creates orders and manages their lifecycle.
// Opens a Discord channel for each order (the "order ticket").
// ─────────────────────────────────────────────────────────────────────────────
import {
  ChannelType,
  PermissionsBitField,
  type Guild,
  type TextChannel,
  type OverwriteResolvable,
} from 'discord.js';
import type { StoreOrder, StoreProduct, OrderStatus, OrdersData } from '../models/index.js';
import { StoreJson } from './store-data.js';
import { settingsManager } from './settings-manager.js';
import { statisticsManager } from './statistics-manager.js';
import { logger } from '../../utils/logger.js';

const store = new StoreJson<OrdersData>('orders.json', () => ({ orders: [], counter: 0 }));

const ORDER_CATEGORY_NAME = 'Store Orders';

async function nextOrderId(): Promise<string> {
  return store.mutate(data => {
    data.counter += 1;
    return `STORE-${String(data.counter).padStart(6, '0')}`;
  });
}

/** Find or create the "Store Orders" Discord category channel. */
async function resolveOrderCategory(guild: Guild): Promise<string | undefined> {
  const settings = await settingsManager.read();

  // Try cached category ID first
  if (settings.orderCategoryId) {
    const existing = guild.channels.cache.get(settings.orderCategoryId);
    if (existing?.type === ChannelType.GuildCategory) return settings.orderCategoryId;
  }

  // Search by name
  const found = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === ORDER_CATEGORY_NAME.toLowerCase(),
  );
  if (found) {
    await settingsManager.update({ orderCategoryId: found.id });
    return found.id;
  }

  // Create the category
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

/** Create the per-order Discord channel. */
async function createOrderChannel(
  guild: Guild,
  orderId: string,
  userId: string,
): Promise<TextChannel | undefined> {
  const settings = await settingsManager.read();
  const categoryId = await resolveOrderCategory(guild);
  const botMember = guild.members.me;

  const overwrites: OverwriteResolvable[] = [
    // @everyone — no access
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    // Buyer — can view and read, cannot send
    {
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [PermissionsBitField.Flags.SendMessages],
    },
  ];

  // Bot — full access
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

  // Staff / admin roles — view and manage
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

  // Channel name matches order ID: store-000001
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
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async getAll(): Promise<StoreOrder[]> {
    const data = await store.read();
    return data.orders.slice();
  },

  async getByUser(userId: string): Promise<StoreOrder[]> {
    const data = await store.read();
    return data.orders
      .filter(o => o.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async getById(orderId: string): Promise<StoreOrder | undefined> {
    const data = await store.read();
    return data.orders.find(o => o.orderId === orderId);
  },

  async getByChannel(channelId: string): Promise<StoreOrder | undefined> {
    const data = await store.read();
    return data.orders.find(o => o.ticketId === channelId);
  },

  /**
   * Create a new order, open a Discord channel for it, and persist everything.
   * Returns the created order and the Discord channel (may be undefined if channel creation failed).
   */
  async create(
    guild: Guild,
    product: StoreProduct,
    userId: string,
    quantity: number,
  ): Promise<{ order: StoreOrder; channel: TextChannel | undefined }> {
    const orderId = await nextOrderId();
    const totalPrice = product.price * quantity;

    const channel = await createOrderChannel(guild, orderId, userId);

    const order: StoreOrder = {
      orderId,
      userId,
      guildId: guild.id,
      ticketId: channel?.id ?? '',
      productId: product.id,
      quantity,
      price: product.price,
      totalPrice,
      status: 'WaitingPayment',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await store.mutate(data => {
      data.orders.push(order);
    });

    await statisticsManager.increment('totalOrders');
    await statisticsManager.increment('pending');

    logger.success(`[Store] Order created: ${orderId} by ${userId}`);
    return { order, channel };
  },

  /**
   * Update an order's status and (optionally) record the staff member who acted.
   * Statistics counters are updated automatically.
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    staffId?: string,
    notes?: string,
  ): Promise<StoreOrder | undefined> {
    let prevStatus: OrderStatus | undefined;

    const order = await store.mutate(data => {
      const found = data.orders.find(o => o.orderId === orderId);
      if (!found) return undefined;
      prevStatus = found.status;
      found.status = status;
      found.updatedAt = Date.now();
      if (staffId !== undefined) found.staffId = staffId;
      if (notes !== undefined) found.notes = notes;
      return JSON.parse(JSON.stringify(found)) as StoreOrder;
    });

    if (order && prevStatus !== undefined) {
      await statisticsManager.onStatusChange(prevStatus, status, order.totalPrice);
    }

    return order;
  },
};
