// ─────────────────────────────────────────────────────────────────────────────
// Store Management System — public facade (Phase 1 + Phase 2).
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
import type { StoreSettings, StoreProduct, CouponType } from './models/index.js';
import { categoryManager } from './services/category-manager.js';
import { productManager } from './services/product-manager.js';
import { orderManager } from './services/order-manager.js';
import { statisticsManager } from './services/statistics-manager.js';
import { settingsManager } from './services/settings-manager.js';
import { paymentManager } from './services/payment-manager.js';
import { couponManager } from './services/coupon-manager.js';
import { offerManager } from './services/offer-manager.js';
import { auditManager } from './services/audit-manager.js';
import { storeStaffManager } from './services/store-staff-manager.js';
import { storeSearch } from './services/store-search.js';

// Renderers
import {
  buildStorePanelEmbed, buildStorePanelComponents,
  buildCategorySelectEmbed, buildCategorySelectComponents,
  buildProductSelectEmbed, buildProductSelectComponents,
  buildProductPageEmbed, buildProductPageComponents,
  buildVariantSelectEmbed, buildVariantSelectComponents,
  buildQuantityModal,
  buildConfirmEmbed, buildConfirmComponents,
  buildOrderEmbed, buildOrderComponents,
  buildMyOrdersEmbed, buildMyOrdersComponents,
  buildStatsEmbed, buildCategoryListEmbed, buildProductListEmbed,
  buildOrderCreatedEmbed, buildSearchModal, buildSearchResultsEmbed,
  buildSearchResultComponents, buildReceiptText,
} from './ui/store-renderer.js';
import {
  buildPaymentSelectEmbed, buildPaymentSelectComponents,
  buildPaymentInstructionsEmbed, buildPaymentInstructionsComponents,
  buildProofModal, buildProofSubmittedEmbed,
  buildProofReviewEmbed, buildProofReviewComponents, buildProofReviewModal,
} from './ui/payment-renderer.js';
import { buildTimelineEmbed } from './ui/timeline-renderer.js';
// order-channel-renderer imported for future use
void ((): void => { /* buildOrderChannelEmbeds, buildOrderChannelComponents — Phase 2 pinned cards */ })();
import {
  buildAdminDashboardEmbed, buildAdminDashboardComponents,
  buildTopStatsEmbed, buildCustomerDashboardEmbed,
  buildCustomerDashboardComponents, buildOrderDetailEmbed,
  buildOrderDetailComponents,
} from './ui/dashboard-renderer.js';
import {
  buildSettingsHomeEmbed, buildSettingsHomeComponents,
  buildCategoriesSectionEmbed, buildCategoriesSectionComponents,
  buildAddCategoryModal, buildCategoryManageComponents,
  buildPaymentsSectionEmbed, buildPaymentsSectionComponents,
  buildCouponsSectionEmbed, buildCouponsSectionComponents,
  buildAddCouponModal, buildOffersSectionEmbed, buildOffersSectionComponents,
  buildLogsSettingsEmbed, buildLogsSettingsComponents,
  buildSetChannelModal, buildGeneralSettingsModal,
} from './ui/settings-renderer.js';
import {
  buildCouponAppliedEmbed, buildCouponInvalidEmbed,
  buildCouponDetailEmbed, buildCouponManageComponents,
  buildCouponEntryModal,
} from './ui/coupon-renderer.js';
import { logger } from '../utils/logger.js';

// ── Permission helpers ────────────────────────────────────────────────────────

type AnyInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction
  | ChatInputCommandInteraction;

function isAdmin(interaction: AnyInteraction): boolean {
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

// ── Class ─────────────────────────────────────────────────────────────────────

class StoreSystem {
  private client: Client | undefined;
  private serverName = 'Mufasa';

  async init(client: Client): Promise<void> {
    this.client = client;
    orderManager.client = client;
    await Promise.all([
      categoryManager.ensureFile(),
      productManager.ensureFile(),
      orderManager.ensureFile(),
      statisticsManager.ensureFile(),
      settingsManager.ensureFile(),
      paymentManager.ensureFile(),
      couponManager.ensureFile(),
      offerManager.ensureFile(),
      auditManager.ensureFile(),
      storeStaffManager.ensureFile(),
    ]);
    logger.success('[Store] Store Management System ready');
  }

  // ── Slash Command ─────────────────────────────────────────────────────────

  async handleSlashCommand(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    const group = interaction.options.getSubcommandGroup(false);

    if (!isAdmin(interaction)) {
      await interaction.reply({
        content: '❌ You need the **Administrator** or **Manage Server** permission to use store commands.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      // Phase 1 commands
      if (!group && sub === 'panel') { await this.cmdPostPanel(interaction, guild); }
      else if (!group && sub === 'stats') { await this.cmdStats(interaction); }
      else if (group === 'category' && sub === 'add') { await this.cmdCategoryAdd(interaction); }
      else if (group === 'category' && sub === 'list') { await this.cmdCategoryList(interaction); }
      else if (group === 'product' && sub === 'add') { await this.cmdProductAdd(interaction); }
      else if (group === 'product' && sub === 'list') { await this.cmdProductList(interaction); }
      else if (group === 'product' && sub === 'stock') { await this.cmdProductStock(interaction); }
      else if (group === 'product' && sub === 'hide') { await this.cmdProductHide(interaction); }
      else if (group === 'product' && sub === 'delete') { await this.cmdProductDelete(interaction); }
      // Phase 2 commands
      else if (!group && sub === 'dashboard') { await this.cmdDashboard(interaction); }
      else if (!group && sub === 'search') { await this.cmdSearch(interaction); }
      else if (!group && sub === 'settings') { await this.cmdSettings(interaction, guild); }
      else if (!group && sub === 'audit') { await this.cmdAudit(interaction); }
      else if (!group && sub === 'export') { await this.cmdExport(interaction); }
      else if (group === 'coupon' && sub === 'add') { await this.cmdCouponAdd(interaction); }
      else if (group === 'coupon' && sub === 'list') { await this.cmdCouponList(interaction); }
      else if (group === 'coupon' && sub === 'delete') { await this.cmdCouponDelete(interaction); }
      else if (group === 'payment' && sub === 'list') { await this.cmdPaymentList(interaction); }
      else if (group === 'payment' && sub === 'toggle') { await this.cmdPaymentToggle(interaction); }
      else if (group === 'product' && sub === 'variant') { await this.cmdVariantAdd(interaction); }
      else if (group === 'offer' && sub === 'add') { await this.cmdOfferAdd(interaction); }
      else if (group === 'offer' && sub === 'list') { await this.cmdOfferList(interaction); }
      else if (group === 'offer' && sub === 'delete') { await this.cmdOfferDelete(interaction); }
      else {
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

  // ── Button Handler ────────────────────────────────────────────────────────

  async handleButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    try {
      // ── Panel ──
      if (id === 'st:panel:browse') { await this.showCategorySelect(interaction); }
      else if (id === 'st:panel:orders') { await this.showMyOrders(interaction); }
      else if (id === 'st:panel:support') { await this.showSupport(interaction); }
      else if (id === 'st:panel:refresh') { await this.refreshPanel(interaction); }
      else if (id === 'st:panel:search') { await interaction.showModal(buildSearchModal()); }

      // ── Browse ──
      else if (id === 'st:browse:back') { await this.showCategorySelect(interaction); }
      else if (id.startsWith('st:product:buy:')) {
        const productId = id.slice('st:product:buy:'.length);
        await this.openBuyModal(interaction, productId, undefined);
      }
      else if (id.startsWith('st:product:back:')) {
        const categoryId = id.slice('st:product:back:'.length);
        await this.showProductSelect(interaction, categoryId);
      }

      // ── Variant selection ──
      else if (id.startsWith('st:var:select:')) {
        const productId = id.slice('st:var:select:'.length);
        await this.showVariantSelect(interaction, productId);
      }

      // ── Confirm ──
      else if (id.startsWith('st:confirm:yes:')) {
        await this.handleConfirmPurchase(interaction, guild, id);
      }
      else if (id === 'st:confirm:no') {
        await interaction.update({ content: '✅ Purchase cancelled.', embeds: [], components: [] });
      }

      // ── Payment method ──
      else if (id.startsWith('st:pm:show:')) {
        const orderId = id.slice('st:pm:show:'.length);
        await this.showPaymentInstructions(interaction, orderId);
      }
      else if (id.startsWith('st:pm:change:')) {
        const orderId = id.slice('st:pm:change:'.length);
        await this.showPaymentSelect(interaction, orderId);
      }

      // ── Proof ──
      else if (id.startsWith('st:pr:submit:')) {
        const orderId = id.slice('st:pr:submit:'.length);
        await this.openProofModal(interaction, orderId);
      }
      else if (id.startsWith('st:pr:approve:')) {
        const orderId = id.slice('st:pr:approve:'.length);
        await this.approveProof(interaction, guild, orderId);
      }
      else if (id.startsWith('st:pr:reject:')) {
        const orderId = id.slice('st:pr:reject:'.length);
        await interaction.showModal(buildProofReviewModal(orderId, 'reject'));
      }
      else if (id.startsWith('st:pr:moreinfo:')) {
        const orderId = id.slice('st:pr:moreinfo:'.length);
        await interaction.showModal(buildProofReviewModal(orderId, 'moreinfo'));
      }
      else if (id.startsWith('st:pr:view:')) {
        const orderId = id.slice('st:pr:view:'.length);
        await this.viewProof(interaction, orderId);
      }

      // ── Order actions ──
      else if (id.startsWith('st:order:pay:')) {
        const orderId = id.slice('st:order:pay:'.length);
        await this.staffOrderAction(interaction, guild, orderId, 'pay');
      }
      else if (id.startsWith('st:order:prepare:')) {
        const orderId = id.slice('st:order:prepare:'.length);
        await this.staffOrderAction(interaction, guild, orderId, 'prepare');
      }
      else if (id.startsWith('st:order:deliver:')) {
        const orderId = id.slice('st:order:deliver:'.length);
        await this.staffOrderAction(interaction, guild, orderId, 'deliver');
      }
      else if (id.startsWith('st:order:complete:')) {
        const orderId = id.slice('st:order:complete:'.length);
        await this.staffOrderAction(interaction, guild, orderId, 'complete');
      }
      else if (id.startsWith('st:order:cancel:')) {
        const orderId = id.slice('st:order:cancel:'.length);
        await this.staffOrderAction(interaction, guild, orderId, 'cancel');
      }
      else if (id.startsWith('st:order:refund:')) {
        const orderId = id.slice('st:order:refund:'.length);
        await this.staffOrderAction(interaction, guild, orderId, 'refund');
      }

      // ── Delivery notes ──
      else if (id.startsWith('st:dn:add:')) {
        const orderId = id.slice('st:dn:add:'.length);
        await this.openDeliveryNoteModal(interaction, orderId);
      }

      // ── Admin dashboard ──
      else if (id === 'st:dash:refresh' || id === 'st:dash:orders' || id === 'st:dash:products') {
        await this.showAdminDashboard(interaction);
      }
      else if (id === 'st:dash:topstats') {
        await this.showTopStats(interaction);
      }
      else if (id === 'st:dash:export') {
        await this.exportOrders(interaction);
      }

      // ── Customer dashboard ──
      else if (id === 'st:cust:refresh' || id === 'st:cust:active' || id === 'st:cust:history') {
        await this.showCustomerDashboard(interaction);
      }
      else if (id === 'st:cust:back') {
        await this.showCustomerDashboard(interaction);
      }
      else if (id.startsWith('st:cust:timeline:')) {
        const orderId = id.slice('st:cust:timeline:'.length);
        await this.showOrderTimeline(interaction, orderId);
      }
      else if (id.startsWith('st:cust:receipt:')) {
        const orderId = id.slice('st:cust:receipt:'.length);
        await this.sendReceipt(interaction, orderId);
      }

      // ── Settings panel ──
      else if (id === 'st:ss:home' || id === 'st:ss:refresh') {
        await this.showSettingsHome(interaction);
      }
      else if (id === 'st:ss:categories') { await this.showSettingsCategories(interaction); }
      else if (id === 'st:ss:products') { await this.showCategorySelect(interaction); }
      else if (id === 'st:ss:payments') { await this.showSettingsPayments(interaction); }
      else if (id === 'st:ss:coupons') { await this.showSettingsCoupons(interaction); }
      else if (id === 'st:ss:offers') { await this.showSettingsOffers(interaction); }
      else if (id === 'st:ss:logs') { await this.showSettingsLogs(interaction); }
      else if (id === 'st:ss:general') { await this.openGeneralSettingsModal(interaction); }
      else if (id === 'st:ss:panel') { await this.settingsPostPanel(interaction, guild); }
      else if (id === 'st:ss:roles') { await this.showSettingsRoles(interaction); }
      else if (id === 'st:ss:cat:add') { await interaction.showModal(buildAddCategoryModal()); }
      else if (id.startsWith('st:ss:cat:toggle:')) {
        const catId = id.slice('st:ss:cat:toggle:'.length);
        await this.toggleCategory(interaction, catId);
      }
      else if (id.startsWith('st:ss:cat:delete:')) {
        const catId = id.slice('st:ss:cat:delete:'.length);
        await this.deleteCategory(interaction, catId);
      }
      else if (id.startsWith('st:ss:cp:toggle:')) {
        const cpId = id.slice('st:ss:cp:toggle:'.length);
        await this.toggleCoupon(interaction, cpId);
      }
      else if (id.startsWith('st:ss:cp:delete:')) {
        const cpId = id.slice('st:ss:cp:delete:'.length);
        await this.deleteCoupon(interaction, cpId);
      }
      else if (id === 'st:ss:cp:add') { await interaction.showModal(buildAddCouponModal()); }
      else if (id === 'st:ss:of:add') { await this.showOfferAddInfo(interaction); }
      else if (id === 'st:ss:logs:setaudit') { await interaction.showModal(buildSetChannelModal('audit')); }
      else if (id === 'st:ss:logs:setlowstock') { await interaction.showModal(buildSetChannelModal('lowstock')); }

      // ── Coupon entry CTA ──
      else if (id.startsWith('st:cp:enter:')) {
        const rest = id.slice('st:cp:enter:'.length);
        const [productId, qtyStr] = rest.split(':');
        await interaction.showModal(buildCouponEntryModal(productId ?? '', parseInt(qtyStr ?? '1', 10)));
      }

    } catch (err) {
      logger.error(`[Store] Button handler error (${id})`, err);
      const msg = '❌ Something went wrong. Please try again.';
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
    }
  }

  // ── Select Menu Handler ───────────────────────────────────────────────────

  async handleSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    try {
      if (id === 'st:select:category') {
        await this.showProductSelect(interaction, interaction.values[0] ?? '');
      }
      else if (id === 'st:select:product') {
        await this.showProductDetail(interaction, interaction.values[0] ?? '');
      }
      else if (id.startsWith('st:pm:select:')) {
        const orderId = id.slice('st:pm:select:'.length);
        await this.handlePaymentMethodSelect(interaction, orderId);
      }
      else if (id.startsWith('st:var:pick:')) {
        const productId = id.slice('st:var:pick:'.length);
        await this.handleVariantPick(interaction, productId, interaction.values[0] ?? '');
      }
      else if (id === 'st:search:select') {
        await this.showProductDetailById(interaction, interaction.values[0] ?? '');
      }
      else if (id === 'st:myorders:select') {
        await this.showOrderDetail(interaction, interaction.values[0] ?? '');
      }
      else if (id === 'st:ss:cat:select') {
        await this.showCategoryManage(interaction, interaction.values[0] ?? '');
      }
      else if (id === 'st:ss:pm:select') {
        await this.togglePaymentMethod(interaction, interaction.values[0] ?? '');
      }
      else if (id === 'st:ss:cp:select') {
        await this.showCouponDetail(interaction, interaction.values[0] ?? '');
      }
    } catch (err) {
      logger.error(`[Store] Select menu error (${id})`, err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral });
      }
    }
    void guild;
  }

  // ── Modal Handler ─────────────────────────────────────────────────────────

  async handleModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    try {
      if (id.startsWith('st:modal:qty:')) {
        await this.processQuantityModal(interaction, guild, id);
      }
      else if (id.startsWith('st:modal:proof:')) {
        const orderId = id.slice('st:modal:proof:'.length);
        await this.processProofSubmission(interaction, orderId);
      }
      else if (id.startsWith('st:modal:prreview:')) {
        const rest = id.slice('st:modal:prreview:'.length);
        const lastColon = rest.lastIndexOf(':');
        const orderId = rest.slice(0, lastColon);
        const action = rest.slice(lastColon + 1) as 'reject' | 'moreinfo';
        await this.processProofReview(interaction, guild, orderId, action);
      }
      else if (id === 'st:modal:search') {
        const query = interaction.fields.getTextInputValue('query').trim();
        await this.processSearch(interaction, query);
      }
      else if (id.startsWith('st:modal:cp:enter:')) {
        const rest = id.slice('st:modal:cp:enter:'.length);
        const parts = rest.split(':');
        const productId = parts[0] ?? '';
        const qty = parseInt(parts[1] ?? '1', 10);
        await this.processCouponEntry(interaction, productId, qty);
      }
      else if (id === 'st:modal:ss:cat:add') {
        await this.processAddCategory(interaction);
      }
      else if (id === 'st:modal:ss:cp:add') {
        await this.processAddCoupon(interaction);
      }
      else if (id.startsWith('st:modal:ss:logs:')) {
        const channelType = id.slice('st:modal:ss:logs:'.length) as 'audit' | 'lowstock';
        await this.processLogChannelSetting(interaction, channelType);
      }
      else if (id === 'st:modal:ss:general') {
        await this.processGeneralSettings(interaction);
      }
      else if (id.startsWith('st:modal:dn:')) {
        const orderId = id.slice('st:modal:dn:'.length);
        await this.processDeliveryNote(interaction, guild, orderId);
      }
    } catch (err) {
      logger.error(`[Store] Modal handler error (${id})`, err);
      const msg = '❌ An error occurred. Please try again.';
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
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
    await interaction.update({
      embeds: [buildProductSelectEmbed(category, products)],
      components: buildProductSelectComponents(products),
      content: '',
    });
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
    await productManager.incrementViewCount(productId);
    const discount = await offerManager.getFlashSaleDiscount(productId);
    await interaction.update({
      embeds: [buildProductPageEmbed(product, category, discount)],
      components: buildProductPageComponents(product, product.categoryId),
      content: '',
    });
  }

  private async showProductDetailById(
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
    await productManager.incrementViewCount(productId);
    const discount = await offerManager.getFlashSaleDiscount(productId);
    await interaction.update({
      embeds: [buildProductPageEmbed(product, category, discount)],
      components: buildProductPageComponents(product, product.categoryId),
      content: '',
    });
  }

  private async showVariantSelect(
    interaction: ButtonInteraction,
    productId: string,
  ): Promise<void> {
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [buildVariantSelectEmbed(product)],
      components: buildVariantSelectComponents(product),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleVariantPick(
    interaction: StringSelectMenuInteraction,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.update({ content: '❌ Product not found.', embeds: [], components: [] });
      return;
    }
    const variant = product.variants?.find(v => v.id === variantId);
    if (!variant) {
      await interaction.update({ content: '❌ Variant not found.', embeds: [], components: [] });
      return;
    }
    await interaction.showModal(buildQuantityModal(productId, `${product.name} — ${variant.name}`, variantId));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Purchase flow
  // ─────────────────────────────────────────────────────────────────────────

  private async openBuyModal(
    interaction: ButtonInteraction,
    productId: string,
    variantId: string | undefined,
  ): Promise<void> {
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!product.unlimitedStock && product.stock <= 0) {
      await interaction.reply({ content: '❌ This product is out of stock.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(buildQuantityModal(productId, product.name, variantId));
  }

  private async processQuantityModal(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    customId: string,
  ): Promise<void> {
    // st:modal:qty:productId[:variantId]
    const rest = customId.slice('st:modal:qty:'.length);
    const colonIdx = rest.indexOf(':');
    const productId = colonIdx === -1 ? rest : rest.slice(0, colonIdx);
    const variantId = colonIdx === -1 ? undefined : rest.slice(colonIdx + 1);

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
    if (!product || !product.enabled || product.hidden) {
      await interaction.reply({ content: '❌ This product is no longer available.', flags: MessageFlags.Ephemeral });
      return;
    }

    const variant = variantId ? product.variants?.find(v => v.id === variantId) : undefined;

    const stockCheck = variant
      ? (variant.unlimitedStock || variant.stock >= quantity)
      : productManager.isInStock(product, quantity);

    if (!stockCheck) {
      await interaction.reply({ content: '❌ Not enough stock available.', flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await settingsManager.read();
    if (settings.maxOrdersPerUser > 0) {
      const userOrderCount = await orderManager.countByUser(interaction.user.id);
      if (userOrderCount >= settings.maxOrdersPerUser) {
        await interaction.reply({
          content: `❌ You have reached the maximum of **${settings.maxOrdersPerUser}** active orders.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    const category = await categoryManager.get(product.categoryId);
    if (!category) {
      await interaction.reply({ content: '❌ Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const flashDiscount = await offerManager.getFlashSaleDiscount(productId);

    await interaction.reply({
      embeds: [buildConfirmEmbed(product, category, quantity, variant, flashDiscount)],
      components: buildConfirmComponents(productId, quantity, variantId),
      flags: MessageFlags.Ephemeral,
    });
    void guild;
  }

  private async handleConfirmPurchase(
    interaction: ButtonInteraction,
    guild: Guild,
    customId: string,
  ): Promise<void> {
    // st:confirm:yes:productId:qty[:variantId]
    const rest = customId.slice('st:confirm:yes:'.length);
    const parts = rest.split(':');
    const productId = parts[0] ?? '';
    const qty = parseInt(parts[1] ?? '1', 10);
    const variantId = parts[2];
    await this.confirmPurchase(interaction, guild, productId, qty, variantId);
  }

  private async confirmPurchase(
    interaction: ButtonInteraction,
    guild: Guild,
    productId: string,
    quantity: number,
    variantId?: string,
  ): Promise<void> {
    await interaction.deferUpdate();

    const product = await productManager.get(productId);
    if (!product) {
      await interaction.editReply({ content: '❌ Product not found.', embeds: [], components: [] });
      return;
    }

    const variant = variantId ? product.variants?.find(v => v.id === variantId) : undefined;
    const stockOk = variant
      ? (variant.unlimitedStock || variant.stock >= quantity)
      : productManager.isInStock(product, quantity);

    if (!stockOk) {
      await interaction.editReply({ content: '❌ Not enough stock available.', embeds: [], components: [] });
      return;
    }

    const flashDiscount = await offerManager.getFlashSaleDiscount(productId);
    const basePrice = variant?.price ?? product.price;
    const discountedUnitPrice = flashDiscount > 0 ? Math.floor(basePrice * (1 - flashDiscount / 100)) : basePrice;
    const originalPrice = basePrice * quantity;
    const flashDiscountAmount = flashDiscount > 0 ? originalPrice - discountedUnitPrice * quantity : 0;

    if (variant) {
      // Use variant-level price for the product object
      const tempProduct: StoreProduct = { ...product, price: variant.price };
      Object.assign(product, tempProduct);
    }

    const { order, channel } = await orderManager.create(guild, product, interaction.user.id, quantity, {
      variantId,
      discountAmount: flashDiscountAmount,
    });

    // Increment sales count
    await productManager.incrementSalesCount(productId, quantity);

    // Reserve stock
    if (!product.unlimitedStock && !variantId) {
      await productManager.reserveStock(productId, quantity);
    }

    // Post order channel content
    if (channel) {
      const customerTag = interaction.user.username;
      const paymentMethods = await paymentManager.listActive();
      const orderEmbed = buildOrderEmbed(order, product, customerTag);
      const orderComponents = buildOrderComponents(order);

      await channel.send({
        content: `📋 New order from <@${interaction.user.id}>`,
        embeds: [orderEmbed],
        components: orderComponents,
      });

      // Payment method selection if methods are configured
      if (paymentMethods.length > 0) {
        await channel.send({
          embeds: [buildPaymentSelectEmbed(order, product)],
          components: buildPaymentSelectComponents(paymentMethods, order.orderId),
        });
      }

      const settings = await settingsManager.read();
      const pings = settings.supportRoles.map(r => `<@&${r}>`).join(' ');
      if (pings) {
        await channel.send({ content: `🔔 ${pings} — new store order needs attention.` });
      }
    }

    await auditManager.log({
      action: 'order_created',
      userId: interaction.user.id,
      orderId: order.orderId,
      productId,
    });

    await interaction.editReply({
      content: '',
      embeds: [buildOrderCreatedEmbed(order, channel?.id)],
      components: [],
    });

    logger.info(`[Store] Order ${order.orderId} created for ${interaction.user.id}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Payment methods
  // ─────────────────────────────────────────────────────────────────────────

  private async showPaymentSelect(
    interaction: ButtonInteraction,
    orderId: string,
  ): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.reply({ content: '❌ Order not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const product = await productManager.get(order.productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const roleIds = member ? [...member.roles.cache.keys()] : [];
    const methods = await paymentManager.listForRoles(roleIds);

    await interaction.reply({
      embeds: [buildPaymentSelectEmbed(order, product)],
      components: buildPaymentSelectComponents(methods, orderId),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handlePaymentMethodSelect(
    interaction: StringSelectMenuInteraction,
    orderId: string,
  ): Promise<void> {
    const methodId = interaction.values[0] ?? '';
    const [order, method] = await Promise.all([
      orderManager.getById(orderId),
      paymentManager.get(methodId),
    ]);

    if (!order || !method) {
      await interaction.update({ content: '❌ Order or payment method not found.', embeds: [], components: [] });
      return;
    }

    const product = await productManager.get(order.productId);
    if (!product) {
      await interaction.update({ content: '❌ Product not found.', embeds: [], components: [] });
      return;
    }

    await orderManager.setPaymentMethod(orderId, methodId);

    await interaction.update({
      embeds: [buildPaymentInstructionsEmbed(method, order, product)],
      components: buildPaymentInstructionsComponents(orderId, methodId),
    });
  }

  private async showPaymentInstructions(
    interaction: ButtonInteraction,
    orderId: string,
  ): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.reply({ content: '❌ Order not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const product = await productManager.get(order.productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (order.paymentMethodId) {
      const method = await paymentManager.get(order.paymentMethodId);
      if (method) {
        await interaction.reply({
          embeds: [buildPaymentInstructionsEmbed(method, order, product)],
          components: buildPaymentInstructionsComponents(orderId, method.id),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // No method selected yet — show selection
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const roleIds = member ? [...member.roles.cache.keys()] : [];
    const methods = await paymentManager.listForRoles(roleIds);

    await interaction.reply({
      embeds: [buildPaymentSelectEmbed(order, product)],
      components: buildPaymentSelectComponents(methods, orderId),
      flags: MessageFlags.Ephemeral,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Payment proof
  // ─────────────────────────────────────────────────────────────────────────

  private async openProofModal(interaction: ButtonInteraction, orderId: string): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.reply({ content: '❌ Order not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const method = order.paymentMethodId ? await paymentManager.get(order.paymentMethodId) : undefined;
    const fallbackMethod = method ?? {
      id: 'default',
      name: 'Payment',
      icon: '💳',
      instructions: '',
      status: 'active' as const,
      order: 0,
      color: 0xf5a623,
      requiresScreenshot: false,
      requiresTransactionId: true,
      requiresPhone: false,
      requiresWallet: false,
      requiresCharacter: false,
      requiresNotes: true,
      roleRestrictions: [],
      createdAt: Date.now(),
    };

    await interaction.showModal(buildProofModal(orderId, fallbackMethod));
  }

  private async processProofSubmission(
    interaction: ModalSubmitInteraction,
    orderId: string,
  ): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.reply({ content: '❌ Order not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const transactionId = this.safeGetField(interaction, 'transaction_id');
    const phone = this.safeGetField(interaction, 'phone');
    const wallet = this.safeGetField(interaction, 'wallet');
    const character = this.safeGetField(interaction, 'character');
    const notes = this.safeGetField(interaction, 'notes');

    const proof = {
      submittedAt: Date.now(),
      submittedBy: interaction.user.id,
      transactionId: transactionId || undefined,
      notes: [phone, wallet, character, notes].filter(Boolean).join('\n') || undefined,
      attachmentUrls: [],
    };

    await orderManager.submitProof(orderId, proof);
    await orderManager.updateStatus(orderId, 'ProofSubmitted', undefined, undefined, 'Payment proof submitted');

    await auditManager.log({
      action: 'payment_proof_submitted',
      userId: interaction.user.id,
      orderId,
    });

    await interaction.reply({
      embeds: [buildProofSubmittedEmbed(orderId)],
      flags: MessageFlags.Ephemeral,
    });

    // Notify staff in the order channel
    if (order.ticketId && interaction.guild) {
      const channel = interaction.guild.channels.cache.get(order.ticketId) as TextChannel | undefined;
      if (channel) {
        const updatedOrder = await orderManager.getById(orderId);
        if (updatedOrder?.proof) {
          await channel.send({
            content: `📎 <@${interaction.user.id}> has submitted payment proof for order **${orderId}**. Please review below.`,
            embeds: [buildProofReviewEmbed(updatedOrder, updatedOrder.proof)],
            components: buildProofReviewComponents(orderId),
          });
        }
      }
    }

    logger.info(`[Store] Proof submitted for order ${orderId}`);
  }

  private async approveProof(
    interaction: ButtonInteraction,
    guild: Guild,
    orderId: string,
  ): Promise<void> {
    const settings = await settingsManager.read();
    if (!(await isStaff(interaction, settings))) {
      await interaction.reply({ content: '❌ Only staff can approve payments.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();

    await orderManager.reviewProof(orderId, interaction.user.id, 'approved');
    const updated = await orderManager.updateStatus(orderId, 'Paid', interaction.user.id, undefined, 'Payment approved');

    await auditManager.log({ action: 'payment_approved', staffId: interaction.user.id, orderId });
    await statisticsManager.trackStaff(interaction.user.id);

    if (updated) {
      const product = await productManager.get(updated.productId);
      const customerTag = await this.resolveTag(guild, updated.userId);
      await interaction.editReply({
        embeds: [buildOrderEmbed(updated, product ?? this.unknownProduct(), customerTag)],
        components: buildOrderComponents(updated),
      });

      if (updated.ticketId) {
        const channel = guild.channels.cache.get(updated.ticketId) as TextChannel | undefined;
        channel?.send({ content: `<@${updated.userId}> ✅ Your payment has been confirmed! Staff will prepare your item shortly.` });
      }
    }
  }

  private async viewProof(interaction: ButtonInteraction, orderId: string): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order?.proof) {
      await interaction.reply({ content: '❌ No proof found for this order.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [buildProofReviewEmbed(order, order.proof)],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async processProofReview(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    orderId: string,
    action: 'reject' | 'moreinfo',
  ): Promise<void> {
    const settings = await settingsManager.read();
    if (!(await isStaff(interaction, settings))) {
      await interaction.reply({ content: '❌ Only staff can review proofs.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const reason = interaction.fields.getTextInputValue('reason').trim();
    const decision = action === 'reject' ? 'rejected' : 'more_info';

    await orderManager.reviewProof(orderId, interaction.user.id, decision, reason);

    const auditAction = action === 'reject' ? 'payment_rejected' : 'payment_proof_submitted';
    await auditManager.log({ action: auditAction, staffId: interaction.user.id, orderId, reason });

    // If rejected, keep at ProofSubmitted status — buyer needs to resubmit
    const order = await orderManager.getById(orderId);

    await interaction.editReply({
      content: action === 'reject'
        ? `❌ Proof rejected. Buyer will be notified.`
        : `⚠️ More info requested from buyer.`,
    });

    if (order?.ticketId) {
      const channel = guild.channels.cache.get(order.ticketId) as TextChannel | undefined;
      const msg = action === 'reject'
        ? `<@${order.userId}> ❌ Your payment proof has been rejected.\n**Reason:** ${reason}\n\nPlease submit a new proof.`
        : `<@${order.userId}> ⚠️ Staff needs more information about your payment.\n**Request:** ${reason}`;
      channel?.send({ content: msg });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Staff order actions
  // ─────────────────────────────────────────────────────────────────────────

  private async staffOrderAction(
    interaction: ButtonInteraction,
    guild: Guild,
    orderId: string,
    action: 'pay' | 'prepare' | 'deliver' | 'complete' | 'cancel' | 'refund',
  ): Promise<void> {
    const settings = await settingsManager.read();
    if (!(await isStaff(interaction, settings))) {
      await interaction.reply({ content: '❌ Only staff members can manage orders.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();

    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.editReply({ content: '❌ Order not found.', embeds: [], components: [] });
      return;
    }

    const product = await productManager.get(order.productId);

    type NextStatus = 'Paid' | 'Preparing' | 'Delivering' | 'Completed' | 'Cancelled' | 'Refunded';
    let newStatus: NextStatus;

    switch (action) {
      case 'pay':
        if (order.status !== 'WaitingPayment' && order.status !== 'Pending' && order.status !== 'ProofSubmitted') {
          await interaction.editReply({ content: '❌ Order is not awaiting payment.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Paid';
        break;
      case 'prepare':
        if (order.status !== 'Paid') {
          await interaction.editReply({ content: '❌ Order must be Paid before preparing.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Preparing';
        break;
      case 'deliver':
        if (order.status !== 'Preparing' && order.status !== 'Paid') {
          await interaction.editReply({ content: '❌ Order must be Preparing or Paid to deliver.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Delivering';
        break;
      case 'complete':
        if (order.status !== 'Delivering') {
          await interaction.editReply({ content: '❌ Order must be in delivery to complete.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Completed';
        break;
      case 'cancel':
        if (['Completed', 'Cancelled', 'Refunded'].includes(order.status)) {
          await interaction.editReply({ content: '❌ Order is already in a final state.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Cancelled';
        break;
      case 'refund':
        if (order.status !== 'Completed') {
          await interaction.editReply({ content: '❌ Can only refund completed orders.', embeds: [], components: [] });
          return;
        }
        newStatus = 'Refunded';
        break;
    }

    const updated = await orderManager.updateStatus(orderId, newStatus, interaction.user.id);
    if (!updated) {
      await interaction.editReply({ content: '❌ Failed to update order.', embeds: [], components: [] });
      return;
    }

    if (newStatus === 'Completed') {
      if (product && !product.unlimitedStock) {
        await productManager.decrementStock(product.id, updated.quantity);
        await productManager.releaseReservedStock(product.id, updated.quantity);
      }
      await productManager.incrementSalesCount(updated.productId, updated.quantity);
      await statisticsManager.addRevenue(updated.totalPrice, updated.productId);
      await statisticsManager.trackStaff(interaction.user.id);
    } else if (newStatus === 'Cancelled' || newStatus === 'Refunded') {
      if (product && !product.unlimitedStock) {
        await productManager.releaseReservedStock(product.id, updated.quantity);
      }
    }

    await auditManager.log({
      action: newStatus === 'Cancelled' ? 'order_cancelled' : newStatus === 'Refunded' ? 'order_refunded' : 'order_status_changed',
      staffId: interaction.user.id,
      orderId,
      before: order.status,
      after: newStatus,
    });

    const customerTag = await this.resolveTag(guild, updated.userId);
    await interaction.editReply({
      embeds: [buildOrderEmbed(updated, product ?? this.unknownProduct(), customerTag)],
      components: buildOrderComponents(updated),
    });

    // Buyer notification
    if (updated.ticketId) {
      const channel = guild.channels.cache.get(updated.ticketId) as TextChannel | undefined;
      const statusMessages: Partial<Record<NextStatus, string>> = {
        Paid: '✅ Your payment has been confirmed! Staff will prepare your item shortly.',
        Preparing: '⚙️ Staff are now preparing your order!',
        Delivering: '📦 Your order is being delivered!',
        Completed: '🎉 Your order is complete! Thank you for your purchase.',
        Cancelled: '❌ Your order has been cancelled by staff.',
        Refunded: '💸 Your order has been refunded.',
      };
      const msg = statusMessages[newStatus];
      if (msg && channel) {
        await channel.send({ content: `<@${updated.userId}> ${msg}` });
      }
    }

    logger.info(`[Store] Order ${orderId} → ${newStatus} by ${interaction.user.id}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Delivery notes
  // ─────────────────────────────────────────────────────────────────────────

  private async openDeliveryNoteModal(interaction: ButtonInteraction, orderId: string): Promise<void> {
    const {
      ModalBuilder,
      ActionRowBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = await import('discord.js');

    const contentRow = new ActionRowBuilder<InstanceType<typeof TextInputBuilder>>().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Note Content')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000),
    );
    const characterRow = new ActionRowBuilder<InstanceType<typeof TextInputBuilder>>().addComponents(
      new TextInputBuilder()
        .setCustomId('character')
        .setLabel('Character Name (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100),
    );
    const privateRow = new ActionRowBuilder<InstanceType<typeof TextInputBuilder>>().addComponents(
      new TextInputBuilder()
        .setCustomId('is_private')
        .setLabel('Private? (yes/no)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(3)
        .setValue('no'),
    );

    const modal = new ModalBuilder()
      .setCustomId(`st:modal:dn:${orderId}`)
      .setTitle('Add Delivery Note')
      .addComponents(contentRow, characterRow, privateRow);

    await interaction.showModal(modal);
  }

  private async processDeliveryNote(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    orderId: string,
  ): Promise<void> {
    const content = interaction.fields.getTextInputValue('content').trim();
    const character = this.safeGetField(interaction, 'character');
    const isPrivateStr = this.safeGetField(interaction, 'is_private') ?? 'no';
    const isPrivate = isPrivateStr.toLowerCase().startsWith('y');

    await orderManager.addDeliveryNote(orderId, interaction.user.id, content, {
      characterName: character ?? undefined,
      isPrivate,
    });

    await auditManager.log({ action: 'delivery_note_added', staffId: interaction.user.id, orderId });

    await interaction.reply({
      content: `✅ Delivery note added to order **${orderId}**.`,
      flags: MessageFlags.Ephemeral,
    });

    void guild;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Search
  // ─────────────────────────────────────────────────────────────────────────

  private async processSearch(interaction: ModalSubmitInteraction, query: string): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const results = await storeSearch.search({ query, limit: 25 });
    const products = results.map(r => r.product);
    const allCategories = await categoryManager.list();
    const categoryMap = new Map(allCategories.map(c => [c.id, c]));

    await interaction.editReply({
      embeds: [buildSearchResultsEmbed(query, products, categoryMap)],
      components: buildSearchResultComponents(products),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Coupon
  // ─────────────────────────────────────────────────────────────────────────

  private async processCouponEntry(
    interaction: ModalSubmitInteraction,
    productId: string,
    quantity: number,
  ): Promise<void> {
    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();

    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const basePrice = product.price * quantity;

    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const roleIds = member ? [...member.roles.cache.keys()] : [];
    const userOrderCount = await orderManager.countByUser(interaction.user.id);
    const isFirstPurchase = userOrderCount === 0;

    const validation = await couponManager.validate(code, basePrice, roleIds, isFirstPurchase);

    if (!validation.valid || !validation.coupon) {
      await interaction.reply({
        embeds: [buildCouponInvalidEmbed(validation.reason ?? 'Invalid coupon.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const category = await categoryManager.get(product.categoryId);
    if (!category) {
      await interaction.reply({ content: '❌ Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const finalPrice = basePrice - validation.discountAmount;

    await interaction.reply({
      embeds: [
        buildCouponAppliedEmbed(validation.coupon, basePrice, validation.discountAmount, finalPrice, product.currency),
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              custom_id: `st:confirm:yes:${productId}:${quantity}`,
              label: `Confirm — ${finalPrice.toLocaleString()} ${product.currency}`,
              style: 3,
              emoji: { name: '✅' },
            },
            {
              type: 2,
              custom_id: 'st:confirm:no',
              label: 'Cancel',
              style: 4,
              emoji: { name: '❌' },
            },
          ],
        },
      ] as never,
      flags: MessageFlags.Ephemeral,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Dashboards
  // ─────────────────────────────────────────────────────────────────────────

  private async showAdminDashboard(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    const stats = await statisticsManager.read();
    await interaction.editReply({
      embeds: [buildAdminDashboardEmbed(stats)],
      components: buildAdminDashboardComponents(),
    });
  }

  private async showTopStats(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    const [stats, products] = await Promise.all([
      statisticsManager.read(),
      productManager.list(),
    ]);

    const productNameMap = new Map(products.map(p => [p.id, p.name]));
    const emptyMap = new Map<string, string>();

    await interaction.editReply({
      embeds: [buildTopStatsEmbed(stats, productNameMap, emptyMap, emptyMap)],
      components: buildAdminDashboardComponents(),
    });
  }

  private async exportOrders(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = await orderManager.getAll();
    const header = 'orderId,userId,productId,quantity,price,totalPrice,status,createdAt,staffId\n';
    const rows = orders.map(o =>
      [o.orderId, o.userId, o.productId, o.quantity, o.price, o.totalPrice, o.status,
        new Date(o.createdAt).toISOString(), o.staffId ?? ''].join(','),
    ).join('\n');
    const buffer = Buffer.from(header + rows, 'utf-8');
    const { AttachmentBuilder } = await import('discord.js');
    const attachment = new AttachmentBuilder(buffer, { name: `store-orders-${Date.now()}.csv` });
    await interaction.editReply({
      content: `✅ Exported **${orders.length}** orders as CSV.`,
      files: [attachment],
    });
  }

  private async showCustomerDashboard(interaction: ButtonInteraction): Promise<void> {
    const [orders, products] = await Promise.all([
      orderManager.getByUser(interaction.user.id),
      productManager.list(),
    ]);
    await interaction.reply({
      embeds: [buildCustomerDashboardEmbed(interaction.user.id, orders, products)],
      components: buildCustomerDashboardComponents(),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async showOrderDetail(
    interaction: StringSelectMenuInteraction,
    orderId: string,
  ): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.update({ content: '❌ Order not found.', embeds: [], components: [] });
      return;
    }
    const product = await productManager.get(order.productId);
    await interaction.update({
      embeds: [buildOrderDetailEmbed(order, product)],
      components: buildOrderDetailComponents(order),
    });
  }

  private async showOrderTimeline(interaction: ButtonInteraction, orderId: string): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.reply({ content: '❌ Order not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [buildTimelineEmbed(order)],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async sendReceipt(interaction: ButtonInteraction, orderId: string): Promise<void> {
    const order = await orderManager.getById(orderId);
    if (!order) {
      await interaction.reply({ content: '❌ Order not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const product = await productManager.get(order.productId);
    const customerTag = interaction.user.username;
    const receiptText = buildReceiptText(order, product, customerTag);

    const { AttachmentBuilder } = await import('discord.js');
    const buffer = Buffer.from(receiptText, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `receipt-${orderId}.txt` });

    await interaction.reply({
      content: '🧾 Here is your order receipt:',
      files: [attachment],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Settings panel
  // ─────────────────────────────────────────────────────────────────────────

  private async showSettingsHome(
    interaction: ButtonInteraction | ModalSubmitInteraction,
  ): Promise<void> {
    const settings = await settingsManager.read();
    const embed = buildSettingsHomeEmbed(settings);
    const components = buildSettingsHomeComponents();

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components });
    } else {
      await (interaction as ButtonInteraction).update({ embeds: [embed], components, content: '' });
    }
  }

  private async showSettingsCategories(interaction: ButtonInteraction): Promise<void> {
    const categories = await categoryManager.list();
    await interaction.update({
      embeds: [buildCategoriesSectionEmbed(categories)],
      components: buildCategoriesSectionComponents(categories),
      content: '',
    });
  }

  private async showSettingsPayments(interaction: ButtonInteraction): Promise<void> {
    const methods = await paymentManager.list();
    await interaction.update({
      embeds: [buildPaymentsSectionEmbed(methods)],
      components: buildPaymentsSectionComponents(methods),
      content: '',
    });
  }

  private async showSettingsCoupons(interaction: ButtonInteraction): Promise<void> {
    const coupons = await couponManager.list();
    await interaction.update({
      embeds: [buildCouponsSectionEmbed(coupons)],
      components: buildCouponsSectionComponents(coupons),
      content: '',
    });
  }

  private async showSettingsOffers(interaction: ButtonInteraction): Promise<void> {
    const offers = await offerManager.list();
    await interaction.update({
      embeds: [buildOffersSectionEmbed(offers)],
      components: buildOffersSectionComponents(),
      content: '',
    });
  }

  private async showSettingsLogs(interaction: ButtonInteraction): Promise<void> {
    const settings = await settingsManager.read();
    await interaction.update({
      embeds: [buildLogsSettingsEmbed(settings)],
      components: buildLogsSettingsComponents(),
      content: '',
    });
  }

  private async showSettingsRoles(interaction: ButtonInteraction): Promise<void> {
    const settings = await settingsManager.read();
    await interaction.update({
      content:
        `**👮 Staff Roles**\n` +
        `Support Roles: ${settings.supportRoles.length > 0 ? settings.supportRoles.map(r => `<@&${r}>`).join(', ') : '*None*'}\n` +
        `Admin Roles: ${settings.adminRoles.length > 0 ? settings.adminRoles.map(r => `<@&${r}>`).join(', ') : '*None*'}\n\n` +
        `Use \`/store settings\` to manage roles, or contact an admin.`,
      embeds: [],
      components: [],
    });
  }

  private async openGeneralSettingsModal(interaction: ButtonInteraction): Promise<void> {
    const settings = await settingsManager.read();
    await interaction.showModal(buildGeneralSettingsModal(settings));
  }

  private async settingsPostPanel(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.deferUpdate();
    const embed = buildStorePanelEmbed(this.serverName);
    const components = buildStorePanelComponents();
    const channel = guild.channels.cache.get(interaction.channelId);
    if (!channel?.isTextBased()) {
      await interaction.editReply({ content: '❌ Cannot post panel here.', embeds: [], components: [] });
      return;
    }
    const msg = await (channel as TextChannel).send({ embeds: [embed], components });
    await settingsManager.update({ panelChannelId: interaction.channelId, panelMessageId: msg.id });
    await interaction.editReply({ content: `✅ Store panel posted in <#${interaction.channelId}>.`, embeds: [], components: [] });
  }

  private async toggleCategory(interaction: ButtonInteraction, catId: string): Promise<void> {
    const cat = await categoryManager.get(catId);
    if (!cat) {
      await interaction.reply({ content: '❌ Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await categoryManager.setEnabled(catId, !cat.enabled);
    await auditManager.log({ action: 'category_updated', staffId: interaction.user.id, categoryId: catId, after: String(!cat.enabled) });
    await interaction.update({
      content: `✅ Category **${cat.name}** is now ${!cat.enabled ? '✅ enabled' : '❌ disabled'}.`,
      embeds: [],
      components: buildCategoryManageComponents(catId, !cat.enabled),
    });
  }

  private async deleteCategory(interaction: ButtonInteraction, catId: string): Promise<void> {
    const cat = await categoryManager.get(catId);
    if (!cat) {
      await interaction.reply({ content: '❌ Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await categoryManager.delete(catId);
    await auditManager.log({ action: 'category_deleted', staffId: interaction.user.id, categoryId: catId });
    const categories = await categoryManager.list();
    await interaction.update({
      content: `✅ Category **${cat.name}** deleted.`,
      embeds: [buildCategoriesSectionEmbed(categories)],
      components: buildCategoriesSectionComponents(categories),
    });
  }

  private async toggleCoupon(interaction: ButtonInteraction, couponId: string): Promise<void> {
    const coupon = await couponManager.get(couponId);
    if (!coupon) {
      await interaction.reply({ content: '❌ Coupon not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await couponManager.update(couponId, { enabled: !coupon.enabled });
    await interaction.update({
      embeds: [buildCouponDetailEmbed({ ...coupon, enabled: !coupon.enabled })],
      components: buildCouponManageComponents(couponId, !coupon.enabled),
    });
  }

  private async deleteCoupon(interaction: ButtonInteraction, couponId: string): Promise<void> {
    await couponManager.delete(couponId);
    await auditManager.log({ action: 'coupon_deleted', staffId: interaction.user.id, couponId });
    const coupons = await couponManager.list();
    await interaction.update({
      content: '✅ Coupon deleted.',
      embeds: [buildCouponsSectionEmbed(coupons)],
      components: buildCouponsSectionComponents(coupons),
    });
  }

  private async showCategoryManage(interaction: StringSelectMenuInteraction, catId: string): Promise<void> {
    const cat = await categoryManager.get(catId);
    if (!cat) {
      await interaction.update({ content: '❌ Category not found.', embeds: [], components: [] });
      return;
    }
    await interaction.update({
      content: `**${cat.emoji} ${cat.name}**\n${cat.description}\nStatus: ${cat.enabled ? '✅ Enabled' : '❌ Disabled'}`,
      embeds: [],
      components: buildCategoryManageComponents(catId, cat.enabled),
    });
  }

  private async togglePaymentMethod(interaction: StringSelectMenuInteraction, methodId: string): Promise<void> {
    const method = await paymentManager.get(methodId);
    if (!method) {
      await interaction.update({ content: '❌ Payment method not found.', embeds: [], components: [] });
      return;
    }
    const newStatus = method.status === 'active' ? 'inactive' : 'active';
    await paymentManager.setStatus(methodId, newStatus);
    const methods = await paymentManager.list();
    await interaction.update({
      content: `✅ **${method.name}** is now ${newStatus === 'active' ? '✅ active' : '❌ inactive'}.`,
      embeds: [buildPaymentsSectionEmbed(methods)],
      components: buildPaymentsSectionComponents(methods),
    });
  }

  private async showCouponDetail(interaction: StringSelectMenuInteraction, couponId: string): Promise<void> {
    const coupon = await couponManager.get(couponId);
    if (!coupon) {
      await interaction.update({ content: '❌ Coupon not found.', embeds: [], components: [] });
      return;
    }
    await interaction.update({
      embeds: [buildCouponDetailEmbed(coupon)],
      components: buildCouponManageComponents(couponId, coupon.enabled),
      content: '',
    });
  }

  private async showOfferAddInfo(interaction: ButtonInteraction): Promise<void> {
    await interaction.reply({
      content:
        '📢 To add a special offer, use the slash command:\n' +
        '`/store offer add` with the required fields.\n\n' +
        'Offer types: `flash_sale`, `bundle`, `featured`',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async processAddCategory(interaction: ModalSubmitInteraction): Promise<void> {
    const name = interaction.fields.getTextInputValue('name').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const emoji = interaction.fields.getTextInputValue('emoji').trim();
    const existing = await categoryManager.list();
    const category = await categoryManager.create({ name, description, emoji, order: existing.length, enabled: true });
    await auditManager.log({ action: 'category_created', staffId: interaction.user.id, categoryId: category.id });
    await interaction.reply({
      content: `✅ Category **${name}** created with ID \`${category.id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async processAddCoupon(interaction: ModalSubmitInteraction): Promise<void> {
    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const typeStr = interaction.fields.getTextInputValue('type').trim().toLowerCase();
    const valueStr = interaction.fields.getTextInputValue('value').trim();
    const maxUsesStr = this.safeGetField(interaction, 'max_uses');
    const expiresDaysStr = this.safeGetField(interaction, 'expires_days');

    const validTypes: CouponType[] = ['percentage', 'fixed', 'free_item'];
    if (!validTypes.includes(typeStr as CouponType)) {
      await interaction.reply({ content: '❌ Invalid type. Use: percentage, fixed, or free_item.', flags: MessageFlags.Ephemeral });
      return;
    }

    const value = parseFloat(valueStr);
    if (isNaN(value)) {
      await interaction.reply({ content: '❌ Invalid value.', flags: MessageFlags.Ephemeral });
      return;
    }

    const maxUses = maxUsesStr ? parseInt(maxUsesStr, 10) : undefined;
    const expiresAt = expiresDaysStr ? Date.now() + parseInt(expiresDaysStr, 10) * 86400000 : undefined;

    const coupon = await couponManager.create({
      code,
      type: typeStr as CouponType,
      value,
      firstPurchaseOnly: false,
      roleBased: false,
      allowedRoles: [],
      maxUses: maxUses && !isNaN(maxUses) ? maxUses : undefined,
      expiresAt,
      enabled: true,
    });

    await auditManager.log({ action: 'coupon_created', staffId: interaction.user.id, couponId: coupon.id });
    await interaction.reply({
      content: `✅ Coupon **${code}** created with ID \`${coupon.id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async processLogChannelSetting(
    interaction: ModalSubmitInteraction,
    channelType: 'audit' | 'lowstock',
  ): Promise<void> {
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();
    if (channelType === 'audit') {
      await settingsManager.update({ auditLogChannelId: channelId });
    } else {
      await settingsManager.update({ lowStockAlertChannelId: channelId });
    }
    await interaction.reply({
      content: `✅ ${channelType === 'audit' ? 'Audit log' : 'Low stock alert'} channel set to \`${channelId}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async processGeneralSettings(interaction: ModalSubmitInteraction): Promise<void> {
    const currency = interaction.fields.getTextInputValue('default_currency').trim();
    const maxOrdersStr = this.safeGetField(interaction, 'max_orders') ?? '0';
    const maxOrders = parseInt(maxOrdersStr, 10);

    await settingsManager.update({
      defaultCurrency: currency || 'coins',
      maxOrdersPerUser: isNaN(maxOrders) ? 0 : Math.max(0, maxOrders),
    });

    await auditManager.log({ action: 'settings_updated', staffId: interaction.user.id });
    await interaction.reply({ content: '✅ General settings updated.', flags: MessageFlags.Ephemeral });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Panel / misc
  // ─────────────────────────────────────────────────────────────────────────

  private async showMyOrders(interaction: ButtonInteraction): Promise<void> {
    const orders = await orderManager.getByUser(interaction.user.id);
    const allProducts = await productManager.list();
    const embed = buildMyOrdersEmbed(orders, allProducts);
    const components = buildMyOrdersComponents(orders);
    await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
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
  // Private: Slash command handlers (Phase 1)
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
    await settingsManager.update({ panelChannelId: interaction.channelId, panelMessageId: msg.id });
    await interaction.editReply(`✅ Store panel posted in <#${interaction.channelId}>.`);
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
    const category = await categoryManager.create({ name, description, emoji, order: existing.length, enabled: true });
    await auditManager.log({ action: 'category_created', staffId: interaction.user.id, categoryId: category.id });
    await interaction.reply({
      content: `✅ Category **${name}** created with ID \`${category.id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdCategoryList(interaction: ChatInputCommandInteraction): Promise<void> {
    const categories = await categoryManager.list();
    await interaction.reply({ embeds: [buildCategoryListEmbed(categories)], flags: MessageFlags.Ephemeral });
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
      categoryId, name, description, price, currency, stock, unlimitedStock,
      enabled: true, featured: false, hidden: false,
    });

    await auditManager.log({ action: 'product_created', staffId: interaction.user.id, productId: product.id });
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
    await interaction.reply({ embeds: [buildProductListEmbed(products, category)], flags: MessageFlags.Ephemeral });
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
    await auditManager.log({ action: 'product_stock_changed', staffId: interaction.user.id, productId, after: String(amount) });
    const stockStr = amount < 0 ? '♾️ unlimited' : `${amount} in stock`;
    await interaction.reply({ content: `✅ Stock for **${product.name}** updated to **${stockStr}**.`, flags: MessageFlags.Ephemeral });
  }

  private async cmdProductHide(interaction: ChatInputCommandInteraction): Promise<void> {
    const productId = interaction.options.getString('product', true);
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const nowHidden = await productManager.toggleHidden(productId);
    await interaction.reply({ content: `✅ **${product.name}** is now ${nowHidden ? '🙈 hidden' : '👁️ visible'}.`, flags: MessageFlags.Ephemeral });
  }

  private async cmdProductDelete(interaction: ChatInputCommandInteraction): Promise<void> {
    const productId = interaction.options.getString('product', true);
    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await productManager.delete(productId);
    await auditManager.log({ action: 'product_deleted', staffId: interaction.user.id, productId });
    await interaction.reply({ content: `✅ Product **${product.name}** deleted.`, flags: MessageFlags.Ephemeral });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Slash command handlers (Phase 2)
  // ─────────────────────────────────────────────────────────────────────────

  private async cmdDashboard(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const stats = await statisticsManager.read();
    await interaction.editReply({
      embeds: [buildAdminDashboardEmbed(stats)],
      components: buildAdminDashboardComponents(),
    });
  }

  private async cmdSearch(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const query = interaction.options.getString('query') ?? '';
    const results = await storeSearch.search({ query, limit: 25 });
    const products = results.map(r => r.product);
    const allCategories = await categoryManager.list();
    const categoryMap = new Map(allCategories.map(c => [c.id, c]));
    await interaction.editReply({
      embeds: [buildSearchResultsEmbed(query, products, categoryMap)],
      components: buildSearchResultComponents(products),
    });
  }

  private async cmdSettings(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const settings = await settingsManager.read();
    await interaction.editReply({
      embeds: [buildSettingsHomeEmbed(settings)],
      components: buildSettingsHomeComponents(),
    });
    void guild;
  }

  private async cmdAudit(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const entries = await auditManager.getRecent(25);
    if (entries.length === 0) {
      await interaction.editReply('*No audit entries found.*');
      return;
    }

    const { EmbedBuilder } = await import('discord.js');
    const lines = entries.map(e => {
      const time = `<t:${Math.floor(e.timestamp / 1000)}:R>`;
      const who = e.staffId ? ` by <@${e.staffId}>` : '';
      const order = e.orderId ? ` [${e.orderId}]` : '';
      return `\`${e.action}\`${order}${who} — ${time}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📋 Store Audit Log (Recent 25)')
      .setDescription(lines.join('\n'))
      .setColor(0x5865f2)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  private async cmdExport(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const format = (interaction.options.getString('format') ?? 'json') as 'json' | 'csv';
    const orders = await orderManager.getAll();

    const { AttachmentBuilder } = await import('discord.js');
    let buffer: Buffer;
    let filename: string;

    if (format === 'csv') {
      const header = 'orderId,userId,productId,quantity,price,totalPrice,status,createdAt,staffId\n';
      const rows = orders.map(o =>
        [o.orderId, o.userId, o.productId, o.quantity, o.price, o.totalPrice, o.status,
          new Date(o.createdAt).toISOString(), o.staffId ?? ''].join(','),
      ).join('\n');
      buffer = Buffer.from(header + rows, 'utf-8');
      filename = `store-orders-${Date.now()}.csv`;
    } else {
      buffer = Buffer.from(JSON.stringify(orders, null, 2), 'utf-8');
      filename = `store-orders-${Date.now()}.json`;
    }

    const attachment = new AttachmentBuilder(buffer, { name: filename });
    await interaction.editReply({
      content: `✅ Exported **${orders.length}** orders as ${format.toUpperCase()}.`,
      files: [attachment],
    });
  }

  private async cmdCouponAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const code = interaction.options.getString('code', true).toUpperCase();
    const typeStr = interaction.options.getString('type', true) as CouponType;
    const value = interaction.options.getNumber('value', true);
    const maxUses = interaction.options.getInteger('max_uses') ?? undefined;
    const expiresDays = interaction.options.getInteger('expires_days') ?? undefined;

    const coupon = await couponManager.create({
      code, type: typeStr, value,
      firstPurchaseOnly: false, roleBased: false, allowedRoles: [],
      maxUses: maxUses !== undefined ? maxUses : undefined,
      expiresAt: expiresDays !== undefined ? Date.now() + expiresDays * 86400000 : undefined,
      enabled: true,
    });
    await auditManager.log({ action: 'coupon_created', staffId: interaction.user.id, couponId: coupon.id });
    await interaction.reply({ content: `✅ Coupon **${code}** created. ID: \`${coupon.id}\``, flags: MessageFlags.Ephemeral });
  }

  private async cmdCouponList(interaction: ChatInputCommandInteraction): Promise<void> {
    const coupons = await couponManager.list();
    await interaction.reply({ embeds: [buildCouponsSectionEmbed(coupons)], flags: MessageFlags.Ephemeral });
  }

  private async cmdCouponDelete(interaction: ChatInputCommandInteraction): Promise<void> {
    const couponId = interaction.options.getString('coupon', true);
    const coupon = await couponManager.get(couponId);
    if (!coupon) {
      await interaction.reply({ content: '❌ Coupon not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await couponManager.delete(couponId);
    await auditManager.log({ action: 'coupon_deleted', staffId: interaction.user.id, couponId });
    await interaction.reply({ content: `✅ Coupon **${coupon.code}** deleted.`, flags: MessageFlags.Ephemeral });
  }

  private async cmdPaymentList(interaction: ChatInputCommandInteraction): Promise<void> {
    const methods = await paymentManager.list();
    await interaction.reply({ embeds: [buildPaymentsSectionEmbed(methods)], flags: MessageFlags.Ephemeral });
  }

  private async cmdPaymentToggle(interaction: ChatInputCommandInteraction): Promise<void> {
    const methodId = interaction.options.getString('method', true);
    const method = await paymentManager.get(methodId);
    if (!method) {
      await interaction.reply({ content: '❌ Payment method not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const newStatus = method.status === 'active' ? 'inactive' : 'active';
    await paymentManager.setStatus(methodId, newStatus);
    await interaction.reply({
      content: `✅ **${method.name}** is now ${newStatus === 'active' ? '✅ active' : '❌ inactive'}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdVariantAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const productId = interaction.options.getString('product', true);
    const name = interaction.options.getString('name', true);
    const price = interaction.options.getNumber('price', true);
    const stock = interaction.options.getInteger('stock') ?? -1;

    const product = await productManager.get(productId);
    if (!product) {
      await interaction.reply({ content: '❌ Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const variant = await productManager.addVariant(productId, {
      name, price,
      stock: stock < 0 ? 0 : stock,
      unlimitedStock: stock < 0,
      enabled: true,
    });

    await interaction.reply({
      content: `✅ Variant **${name}** added to **${product.name}**. ID: \`${variant?.id ?? 'unknown'}\``,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdOfferAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const type = interaction.options.getString('type', true) as 'flash_sale' | 'bundle' | 'featured';
    const name = interaction.options.getString('name', true);
    const productId = interaction.options.getString('product', true);
    const discount = interaction.options.getNumber('discount') ?? undefined;
    const durationHours = interaction.options.getInteger('hours') ?? undefined;

    const offer = await offerManager.create({
      type, name,
      productIds: [productId],
      discountPercent: discount,
      endAt: durationHours ? Date.now() + durationHours * 3600000 : undefined,
      enabled: true,
    });

    await auditManager.log({ action: 'offer_created', staffId: interaction.user.id, productId });
    await interaction.reply({
      content: `✅ Offer **${name}** created. ID: \`${offer.id}\``,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async cmdOfferList(interaction: ChatInputCommandInteraction): Promise<void> {
    const offers = await offerManager.list();
    await interaction.reply({ embeds: [buildOffersSectionEmbed(offers)], flags: MessageFlags.Ephemeral });
  }

  private async cmdOfferDelete(interaction: ChatInputCommandInteraction): Promise<void> {
    const offerId = interaction.options.getString('offer', true);
    const deleted = await offerManager.delete(offerId);
    await auditManager.log({ action: 'offer_deleted', staffId: interaction.user.id });
    await interaction.reply({
      content: deleted ? '✅ Offer deleted.' : '❌ Offer not found.',
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

  private unknownProduct(): StoreProduct {
    return {
      id: 'unknown', categoryId: '', name: 'Unknown Product',
      description: '', price: 0, currency: 'coins', stock: 0,
      unlimitedStock: true, enabled: false, featured: false, hidden: false,
      createdAt: 0, updatedAt: 0, variants: [], galleryImages: [], tags: [],
      badges: [], reservedStock: 0, lowStockThreshold: 0, viewCount: 0, salesCount: 0,
    };
  }

  private safeGetField(interaction: ModalSubmitInteraction, field: string): string | null {
    try {
      return interaction.fields.getTextInputValue(field).trim() || null;
    } catch {
      return null;
    }
  }
}

export const storeSystem = new StoreSystem();

/** Returns true for any custom ID that belongs to the store system. */
export function isStoreInteraction(customId: string): boolean {
  return customId.startsWith('st:');
}
