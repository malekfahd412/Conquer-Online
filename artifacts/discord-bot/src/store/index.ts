// ─────────────────────────────────────────────────────────────────────────────
// Store Management System — public facade.
//
// This is the only file the rest of the bot (ai.service.ts) should import.
// All `st:*` custom IDs are routed here and handled internally.
// ─────────────────────────────────────────────────────────────────────────────
import {
  MessageFlags,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type TextChannel,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { StoreSettings } from './models/index.js';
import { categoryManager } from './services/category-manager.js';
import { productManager } from './services/product-manager.js';
import { orderManager } from './services/order-manager.js';
import { statisticsManager } from './services/statistics-manager.js';
import { settingsManager } from './services/settings-manager.js';
import {
  buildStorePanelEmbed,
  buildStorePanelComponents,
  buildCategorySelectEmbed,
  buildCategorySelectComponents,
  buildProductSelectEmbed,
  buildProductSelectComponents,
  buildProductPageEmbed,
  buildProductPageComponents,
  buildQuantityModal,
  buildConfirmEmbed,
  buildConfirmComponents,
  buildOrderEmbed,
  buildOrderComponents,
  buildMyOrdersEmbed,
  buildStatsEmbed,
  buildCategoryListEmbed,
  buildProductListEmbed,
  buildOrderCreatedEmbed,
} from './ui/store-renderer.js';
import { logger } from '../utils/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(
  interaction:
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction
    | ChatInputCommandInteraction,
): boolean {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true
  );
}

async function isStaff(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  settings: StoreSettings,
): Promise<boolean> {
  if (isAdmin(interaction)) return true;
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  if (!member) return false;
  const staffRoles = [...settings.supportRoles, ...settings.adminRoles];
  return member.roles.cache.some(r => staffRoles.includes(r.id));
}

// ─────────────────────────────────────────────────────────────────────────────

class StoreSystem {
  private client: Client | undefined;
  private serverName = 'Mufasa';

  async init(client: Client): Promise<void> {
    this.client = client;
    await Promise.all([
      categoryManager.ensureFile(),
      productManager.ensureFile(),
      orderManager.ensureFile(),
      statisticsManager.ensureFile(),
      settingsManager.ensureFile(),
    ]);
    logger.success('[Store] Store Management System ready');
  }

  // ── Slash Command ────────────────────────────────────────────────────────

  async handleSlashCommand(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    const group = interaction.options.getSubcommandGroup(false);

    // Admin-only check for all store commands
    if (!isAdmin(interaction)) {
      await interaction.reply({
        content: '❌ You need the **Administrator** or **Manage Server** permission to use store commands.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      if (!group && sub === 'panel') {
        await this.cmdPostPanel(interaction, guild);
      } else if (!group && sub === 'stats') {
        await this.cmdStats(interaction);
      } else if (group === 'category' && sub === 'add') {
        await this.cmdCategoryAdd(interaction);
      } else if (group === 'category' && sub === 'list') {
        await this.cmdCategoryList(interaction);
      } else if (group === 'product' && sub === 'add') {
        await this.cmdProductAdd(interaction);
      } else if (group === 'product' && sub === 'list') {
        await this.cmdProductList(interaction);
      } else if (group === 'product' && sub === 'stock') {
        await this.cmdProductStock(interaction);
      } else if (group === 'product' && sub === 'hide') {
        await this.cmdProductHide(interaction);
      } else if (group === 'product' && sub === 'delete') {
        await this.cmdProductDelete(interaction);
      } else {
        await interaction.reply({ content: '❌ Unknown subcommand.', flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      logger.error('[Store] Slash command error', err);
      const msg = '❌ An error occurred. Please try again.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
    }
  }

  // ── Button Handler ───────────────────────────────────────────────────────

  async handleButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    try {
      if (id === 'st:panel:browse') {
        await this.showCategorySelect(interaction);
      } else if (id === 'st:panel:orders') {
        await this.showMyOrders(interaction);
      } else if (id === 'st:panel:support') {
        await this.showSupport(interaction);
      } else if (id === 'st:panel:refresh') {
        await this.refreshPanel(interaction);
      } else if (id === 'st:browse:back') {
        await this.showCategorySelect(interaction);
      } else if (id.startsWith('st:product:buy:')) {
        const productId = id.slice('st:product:buy:'.length);
        await this.openBuyModal(interaction, productId);
      } else if (id.startsWith('st:product:back:')) {
        const categoryId = id.slice('st:product:back:'.length);
        await this.showProductSelect(interaction, categoryId);
      } else if (id.startsWith('st:confirm:yes:')) {
        const rest = id.slice('st:confirm:yes:'.length);
        const lastColon = rest.lastIndexOf(':');
        const productId = rest.slice(0, lastColon);
        const qty = parseInt(rest.slice(lastColon + 1), 10);
        await this.confirmPurchase(interaction, guild, productId, qty);
      } else if (id === 'st:confirm:no') {
        await interaction.update({
          content: '✅ Purchase cancelled.',
          embeds: [],
          components: [],
        });
      } else if (id.startsWith('st:order:pay:')) {
        const orderId = id.slice('st:order:pay:'.length);
        await this.staffAction(interaction, guild, orderId, 'pay');
      } else if (id.startsWith('st:order:deliver:')) {
        const orderId = id.slice('st:order:deliver:'.length);
        await this.staffAction(interaction, guild, orderId, 'deliver');
      } else if (id.startsWith('st:order:complete:')) {
        const orderId = id.slice('st:order:complete:'.length);
        await this.staffAction(interaction, guild, orderId, 'complete');
      } else if (id.startsWith('st:order:cancel:')) {
        const orderId = id.slice('st:order:cancel:'.length);
        await this.staffAction(interaction, guild, orderId, 'cancel');
      }
    } catch (err) {
      logger.error(`[Store] Button handler error (${id})`, err);
      const msg = '❌ Something went wrong. Please try again.';
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
    }
  }

  // ── Select Menu Handler ──────────────────────────────────────────────────

  async handleSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    try {
      if (id === 'st:select:category') {
        await this.showProductSelect(interaction, interaction.values[0]);
      } else if (id === 'st:select:product') {
        await this.showProductDetail(interaction, interaction.values[0]);
      }
    } catch (err) {
      logger.error(`[Store] Select menu error (${id})`, err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral });
      }
    }
    void guild; // guild available if needed for future use
  }

  // ── Modal Handler ────────────────────────────────────────────────────────

  async handleModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    if (id.startsWith('st:modal:qty:')) {
      const productId = id.slice('st:modal:qty:'.length);
      await this.processQuantityModal(interaction, guild, productId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Browse flow
  // ─────────────────────────────────────────────────────────────────────────

  private async showCategorySelect(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
  ): Promise<void> {
    const categories = await categoryManager.listEnabled();
    const embed = buildCategorySelectEmbed(categories);
    const components = buildCategorySelectComponents(categories);

    await interaction.update({ embeds: [embed], components, content: '' });
  }

  private async showProductSelect(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    categoryId: string,
  ): Promise<void> {
    const category = await categoryManager.get(categoryId);
    if (!category) {
      await interaction.update({ content: '❌ Category not found.', embeds: [], components: [] });
      return;
    }

    const products = await productManager.listVisible(categoryId);
    const embed = buildProductSelectEmbed(category, products);
    const components = buildProductSelectComponents(products);

    await interaction.update({ embeds: [embed], components, content: '' });
  }

  private async showProductDetail(
    interaction: StringSelectMenuInteraction,
    productId: string,
  ): Promise<void> {
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.update({ content: '❌ Product not found.', embeds: [], components: [] });
      return;
    }

    const category = await categoryManager.get(product.categoryId);
    if (!category) {
      await interaction.update({ content: '❌ Category not found.', embeds: [], components: [] });
      return;
    }

    const embed = buildProductPageEmbed(product, category);
    const components = buildProductPageComponents(product, product.categoryId);

    await interaction.update({ embeds: [embed], components, content: '' });
  }

  private async openBuyModal(interaction: ButtonInteraction, productId: string): Promise<void> {
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!product.unlimitedStock && product.stock <= 0) {
      await interaction.reply({ content: '❌ This product is out of stock.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(buildQuantityModal(productId, product.name));
  }

  private async processQuantityModal(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    productId: string,
  ): Promise<void> {
    const rawQty = interaction.fields.getTextInputValue('quantity').trim();
    const quantity = parseInt(rawQty, 10);

    if (isNaN(quantity) || quantity <= 0) {
      await interaction.reply({ content: '❌ Please enter a valid quantity greater than 0.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (quantity > 99) {
      await interaction.reply({ content: '❌ Maximum quantity is 99.', flags: MessageFlags.Ephemeral });
      return;
    }

    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!product.enabled || product.hidden) {
      await interaction.reply({ content: '❌ This product is no longer available.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!product.unlimitedStock && product.stock < quantity) {
      await interaction.reply({
        content: `❌ Not enough stock. Only **${product.stock}** left.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const category = await categoryManager.get(product.categoryId);
    if (!category) {
      await interaction.reply({ content: '❌ Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = buildConfirmEmbed(product, category, quantity);
    const components = buildConfirmComponents(productId, quantity);

    await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    void guild;
  }

  private async confirmPurchase(
    interaction: ButtonInteraction,
    guild: Guild,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await interaction.deferUpdate();

    const product = await productManager.get(productId);
    if (!product) {
      await interaction.editReply({ content: '❌ Product not found.', embeds: [], components: [] });
      return;
    }

    if (!product.unlimitedStock && product.stock < quantity) {
      await interaction.editReply({
        content: `❌ Not enough stock. Only **${product.stock}** left.`,
        embeds: [],
        components: [],
      });
      return;
    }

    const { order, channel } = await orderManager.create(guild, product, interaction.user.id, quantity);

    // Post order embed to the order channel
    if (channel) {
      const memberTag = interaction.user.username;
      const orderEmbed = buildOrderEmbed(order, product, memberTag);
      const orderComponents = buildOrderComponents(order);

      await channel.send({
        content: `📋 New order from <@${interaction.user.id}>`,
        embeds: [orderEmbed],
        components: orderComponents,
      });

      // Ping support roles if configured
      const settings = await settingsManager.read();
      const pings = settings.supportRoles.map(r => `<@&${r}>`).join(' ');
      if (pings) {
        await channel.send({ content: `🔔 ${pings} — a new store order needs attention.` });
      }
    }

    const successEmbed = buildOrderCreatedEmbed(order, channel?.id);

    await interaction.editReply({
      content: '',
      embeds: [successEmbed],
      components: [],
    });

    logger.info(`[Store] Order ${order.orderId} created for user ${interaction.user.id} in guild ${guild.id}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Staff actions
  // ─────────────────────────────────────────────────────────────────────────

  private async staffAction(
    interaction: ButtonInteraction,
    guild: Guild,
    orderId: string,
    action: 'pay' | 'deliver' | 'complete' | 'cancel',
  ): Promise<void> {
    const settings = await settingsManager.read();

    if (!(await isStaff(interaction, settings))) {
      await interaction.reply({
        content: '❌ Only staff members can manage orders.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();

    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.editReply({ content: '❌ Order not found.', embeds: [], components: [] });
      return;
    }

    const product = await productManager.get(order.productId);
    if (!product) {
      await interaction.editReply({ content: '❌ Product data missing.', embeds: [], components: [] });
      return;
    }

    let newStatus: 'Paid' | 'Delivering' | 'Completed' | 'Cancelled';

    switch (action) {
      case 'pay':
        if (order.status !== 'WaitingPayment' && order.status !== 'Pending') {
          await interaction.editReply({ content: '❌ Order is not awaiting payment.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Paid';
        break;
      case 'deliver':
        if (order.status !== 'Paid') {
          await interaction.editReply({ content: '❌ Order has not been paid yet.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Delivering';
        break;
      case 'complete':
        if (order.status !== 'Delivering') {
          await interaction.editReply({ content: '❌ Order is not in delivery.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Completed';
        break;
      case 'cancel':
        if (order.status === 'Completed' || order.status === 'Cancelled' || order.status === 'Refunded') {
          await interaction.editReply({ content: '❌ Order is already in a final state.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Cancelled';
        break;
    }

    const updated = await orderManager.updateStatus(orderId, newStatus, interaction.user.id);
    if (!updated) {
      await interaction.editReply({ content: '❌ Failed to update order.', embeds: [], components: [] });
      return;
    }

    // Decrement stock ONLY when Completed
    if (newStatus === 'Completed') {
      await productManager.decrementStock(product.id, updated.quantity);
    }

    // Rebuild embed and components
    const customerTag = await this.resolveTag(guild, updated.userId);
    const updatedEmbed = buildOrderEmbed(updated, product, customerTag);
    const updatedComponents = buildOrderComponents(updated);

    await interaction.editReply({ embeds: [updatedEmbed], components: updatedComponents });

    // Notify the buyer
    if (updated.ticketId) {
      const channel = guild.channels.cache.get(updated.ticketId) as TextChannel | undefined;
      if (channel) {
        const statusMessages: Partial<Record<typeof newStatus, string>> = {
          Paid: '✅ Your payment has been confirmed! Staff will deliver your item shortly.',
          Delivering: '📦 Your order is now being delivered!',
          Completed: '🎉 Your order has been completed! Thank you for your purchase.',
          Cancelled: '❌ Your order has been cancelled by staff.',
        };
        const msg = statusMessages[newStatus];
        if (msg) {
          await channel.send({ content: `<@${updated.userId}> ${msg}` });
        }
      }
    }

    logger.info(`[Store] Order ${orderId} → ${newStatus} by ${interaction.user.id}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Panel / misc
  // ─────────────────────────────────────────────────────────────────────────

  private async showMyOrders(interaction: ButtonInteraction): Promise<void> {
    const orders = await orderManager.getByUser(interaction.user.id);
    const allProducts = await productManager.list();
    const embed = buildMyOrdersEmbed(orders, allProducts);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async showSupport(interaction: ButtonInteraction): Promise<void> {
    await interaction.reply({
      content:
        '🎫 **Need help with your order?**\n\n' +
        'Please open a support ticket using the ticket panel in this server, or contact a staff member directly.\n' +
        'Include your **Order ID** (e.g. `STORE-000001`) so staff can locate your order quickly.',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async refreshPanel(interaction: ButtonInteraction): Promise<void> {
    const embed = buildStorePanelEmbed(this.serverName);
    const components = buildStorePanelComponents();
    await interaction.update({ embeds: [embed], components });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Admin slash command handlers
  // ─────────────────────────────────────────────────────────────────────────

  private async cmdPostPanel(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = buildStorePanelEmbed(this.serverName);
    const components = buildStorePanelComponents();

    const channel = guild.channels.cache.get(interaction.channelId);
    if (!channel?.isTextBased()) {
      await interaction.editReply('❌ This channel does not support messages.');
      return;
    }

    const msg = await (channel as TextChannel).send({ embeds: [embed], components });

    await settingsManager.update({
      panelChannelId: interaction.channelId,
      panelMessageId: msg.id,
    });

    await interaction.editReply(`✅ Store panel posted in <#${interaction.channelId}>.`);
    logger.success(`[Store] Panel posted in guild ${guild.id} channel ${interaction.channelId}`);
  }

  private async cmdStats(interaction: ChatInputCommandInteraction): Promise<void> {
    const stats = await statisticsManager.read();
    await interaction.reply({ embeds: [buildStatsEmbed(stats)], flags: MessageFlags.Ephemeral });
  }

  private async cmdCategoryAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString('name', true);
    const description = interaction.options.getString('description', true);
    const emoji = interaction.options.getString('emoji', true);
    const existing = await categoryManager.list();
    const order = existing.length;

    const category = await categoryManager.create({
      name,
      description,
      emoji,
      order,
      enabled: true,
    });

    await interaction.reply({
      content: `✅ Category **${name}** created with ID \`${category.id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdCategoryList(interaction: ChatInputCommandInteraction): Promise<void> {
    const categories = await categoryManager.list();
    await interaction.reply({
      embeds: [buildCategoryListEmbed(categories)],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdProductAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString('name', true);
    const categoryId = interaction.options.getString('category', true);
    const price = interaction.options.getNumber('price', true);
    const description = interaction.options.getString('description') ?? '';
    const currency = interaction.options.getString('currency') ?? 'coins';
    const stockOption = interaction.options.getInteger('stock');
    const unlimitedStock = stockOption === null || stockOption < 0;
    const stock = unlimitedStock ? 0 : stockOption ?? 0;

    const category = await categoryManager.get(categoryId);
    if (!category) {
      await interaction.reply({ content: '❌ Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const product = await productManager.create({
      categoryId,
      name,
      description,
      price,
      currency,
      stock,
      unlimitedStock,
      enabled: true,
      featured: false,
      hidden: false,
    });

    await interaction.reply({
      content: `✅ Product **${name}** created in **${category.name}** with ID \`${product.id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdProductList(interaction: ChatInputCommandInteraction): Promise<void> {
    const categoryId = interaction.options.getString('category', true);
    const category = await categoryManager.get(categoryId);
    if (!category) {
      await interaction.reply({ content: '❌ Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const products = await productManager.listByCategory(categoryId);
    await interaction.reply({
      embeds: [buildProductListEmbed(products, category)],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdProductStock(interaction: ChatInputCommandInteraction): Promise<void> {
    const productId = interaction.options.getString('product', true);
    const amount = interaction.options.getInteger('amount', true);

    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    await productManager.setStock(productId, amount);

    const stockStr = amount < 0 ? '♾️ unlimited' : `${amount} in stock`;
    await interaction.reply({
      content: `✅ Stock for **${product.name}** updated to **${stockStr}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdProductHide(interaction: ChatInputCommandInteraction): Promise<void> {
    const productId = interaction.options.getString('product', true);
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const nowHidden = await productManager.toggleHidden(productId);
    await interaction.reply({
      content: `✅ **${product.name}** is now ${nowHidden ? '🙈 hidden' : '👁️ visible'}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdProductDelete(interaction: ChatInputCommandInteraction): Promise<void> {
    const productId = interaction.options.getString('product', true);
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    await productManager.delete(productId);
    await interaction.reply({
      content: `✅ Product **${product.name}** deleted.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Utility
  // ─────────────────────────────────────────────────────────────────────────

  private async resolveTag(guild: Guild, userId: string): Promise<string> {
    try {
      const member = await guild.members.fetch(userId);
      return member.user.username;
    } catch {
      if (this.client) {
        try {
          const user = await this.client.users.fetch(userId);
          return user.username;
        } catch {
          return userId;
        }
      }
      return userId;
    }
  }
}

export const storeSystem = new StoreSystem();

/** Returns true for any custom ID that belongs to the store system. */
export function isStoreInteraction(customId: string): boolean {
  return customId.startsWith('st:');
}
