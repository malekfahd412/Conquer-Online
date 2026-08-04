// ─────────────────────────────────────────────────────────────────────────────
// Settings Renderer — Discord UI for the Store Settings Panel.
// Allows admins to manage categories, products, coupons, offers, payments,
// roles, logs, and general settings — all from Discord.
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
  StoreSettings,
  StoreCategory,
  PaymentMethod,
  StoreCoupon,
  StoreOffer,
} from '../models/index.js';

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

const SETTINGS_COLOR = 0x5865f2;

// ── Settings Home ─────────────────────────────────────────────────────────────

export function buildSettingsHomeEmbed(settings: StoreSettings): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('⚙️ Store Settings Panel')
    .setDescription(
      'Manage all store settings from here. Select a section below to configure it.\n\n' +
      `**Support Roles:** ${settings.supportRoles.length > 0 ? settings.supportRoles.map(r => `<@&${r}>`).join(', ') : '*None*'}\n` +
      `**Admin Roles:** ${settings.adminRoles.length > 0 ? settings.adminRoles.map(r => `<@&${r}>`).join(', ') : '*None*'}\n` +
      `**Order Category:** ${settings.orderCategoryId ? `<#${settings.orderCategoryId}>` : '*Not set*'}\n` +
      `**Audit Log:** ${settings.auditLogChannelId ? `<#${settings.auditLogChannelId}>` : '*Not set*'}\n` +
      `**Default Currency:** ${settings.defaultCurrency}\n` +
      `**Max Orders/User:** ${settings.maxOrdersPerUser === 0 ? 'Unlimited' : String(settings.maxOrdersPerUser)}`,
    )
    .setColor(SETTINGS_COLOR)
    .setFooter({ text: 'Store Settings • Use buttons to navigate' })
    .setTimestamp();
}

export function buildSettingsHomeComponents(): AnyRow[] {
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:ss:categories')
      .setLabel('Categories')
      .setEmoji('🗂️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:products')
      .setLabel('Products')
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:payments')
      .setLabel('Payments')
      .setEmoji('💳')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:coupons')
      .setLabel('Coupons')
      .setEmoji('🎟️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:offers')
      .setLabel('Offers')
      .setEmoji('🔥')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:ss:roles')
      .setLabel('Roles')
      .setEmoji('👮')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:logs')
      .setLabel('Log Channels')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:general')
      .setLabel('General')
      .setEmoji('🔧')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:panel')
      .setLabel('Post Panel')
      .setEmoji('🏪')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('st:ss:refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

// ── Categories Section ────────────────────────────────────────────────────────

export function buildCategoriesSectionEmbed(categories: StoreCategory[]): EmbedBuilder {
  const desc =
    categories.length === 0
      ? '*No categories yet. Add one below.*'
      : categories
          .map(c => `${c.emoji} **${c.name}** \`${c.id}\`\n${c.description} — ${c.enabled ? '✅' : '❌'}`)
          .join('\n\n');

  return new EmbedBuilder()
    .setTitle('🗂️ Store Categories')
    .setDescription(desc)
    .setColor(SETTINGS_COLOR)
    .setFooter({ text: `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}` });
}

export function buildCategoriesSectionComponents(categories: StoreCategory[]): AnyRow[] {
  const rows: AnyRow[] = [];

  if (categories.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('st:ss:cat:select')
      .setPlaceholder('Select a category to manage…')
      .addOptions(
        categories.slice(0, 25).map(c =>
          new StringSelectMenuOptionBuilder()
            .setValue(c.id)
            .setLabel(`${c.emoji} ${c.name}`)
            .setDescription(c.enabled ? '✅ Enabled' : '❌ Disabled'),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('st:ss:cat:add')
        .setLabel('Add Category')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('st:ss:home')
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

export function buildAddCategoryModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('st:modal:ss:cat:add')
    .setTitle('Add Store Category')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Category Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji')
          .setLabel('Emoji')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('e.g. 🎮'),
      ),
    );
}

export function buildCategoryManageComponents(categoryId: string, enabled: boolean): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:ss:cat:toggle:${categoryId}`)
      .setLabel(enabled ? 'Disable' : 'Enable')
      .setEmoji(enabled ? '❌' : '✅')
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`st:ss:cat:delete:${categoryId}`)
      .setLabel('Delete Category')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('st:ss:categories')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

// ── Payment Methods Section ───────────────────────────────────────────────────

export function buildPaymentsSectionEmbed(methods: PaymentMethod[]): EmbedBuilder {
  const desc =
    methods.length === 0
      ? '*No payment methods configured.*'
      : methods
          .map(m => `${m.icon} **${m.name}** — ${m.status === 'active' ? '✅ Active' : '❌ Inactive'}`)
          .join('\n');

  return new EmbedBuilder()
    .setTitle('💳 Payment Methods')
    .setDescription(desc)
    .setColor(SETTINGS_COLOR)
    .setFooter({ text: `${methods.length} method(s)` });
}

export function buildPaymentsSectionComponents(methods: PaymentMethod[]): AnyRow[] {
  const rows: AnyRow[] = [];

  if (methods.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('st:ss:pm:select')
      .setPlaceholder('Select a payment method to toggle…')
      .addOptions(
        methods.slice(0, 25).map(m =>
          new StringSelectMenuOptionBuilder()
            .setValue(m.id)
            .setLabel(`${m.icon} ${m.name}`)
            .setDescription(m.status === 'active' ? '✅ Active' : '❌ Inactive'),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('st:ss:home')
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

// ── Coupons Section ───────────────────────────────────────────────────────────

export function buildCouponsSectionEmbed(coupons: StoreCoupon[]): EmbedBuilder {
  if (coupons.length === 0) {
    return new EmbedBuilder()
      .setTitle('🎟️ Coupons')
      .setDescription('*No coupons yet.*')
      .setColor(SETTINGS_COLOR);
  }

  const now = Date.now();
  const lines = coupons.map(c => {
    const expired = c.expiresAt !== undefined && c.expiresAt < now;
    const maxed = c.maxUses !== undefined && c.usedCount >= c.maxUses;
    const status = !c.enabled || expired || maxed ? '❌' : '✅';
    const typeStr = c.type === 'percentage' ? `${c.value}% off` : c.type === 'fixed' ? `-${c.value}` : 'Free Item';
    return `${status} **${c.code}** — ${typeStr} • Used: ${c.usedCount}${c.maxUses !== undefined ? `/${c.maxUses}` : ''}`;
  });

  return new EmbedBuilder()
    .setTitle('🎟️ Coupons')
    .setDescription(lines.join('\n'))
    .setColor(SETTINGS_COLOR)
    .setFooter({ text: `${coupons.length} coupon(s)` });
}

export function buildCouponsSectionComponents(coupons: StoreCoupon[]): AnyRow[] {
  const rows: AnyRow[] = [];

  if (coupons.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('st:ss:cp:select')
      .setPlaceholder('Select a coupon to manage…')
      .addOptions(
        coupons.slice(0, 25).map(c =>
          new StringSelectMenuOptionBuilder()
            .setValue(c.id)
            .setLabel(c.code)
            .setDescription(`${c.type} — Used: ${c.usedCount}`),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('st:ss:cp:add')
        .setLabel('Add Coupon')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('st:ss:home')
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

export function buildAddCouponModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('st:modal:ss:cp:add')
    .setTitle('Add Coupon')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('code')
          .setLabel('Coupon Code (uppercase)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('e.g. SUMMER20'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('type')
          .setLabel('Type: percentage / fixed / free_item')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('percentage'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel('Value (% or amount or product ID)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setPlaceholder('20'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('max_uses')
          .setLabel('Max Uses (leave blank for unlimited)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder('100'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('expires_days')
          .setLabel('Expires in days (leave blank for no expiry)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5)
          .setPlaceholder('30'),
      ),
    );
}

// ── Offers Section ────────────────────────────────────────────────────────────

export function buildOffersSectionEmbed(offers: StoreOffer[]): EmbedBuilder {
  if (offers.length === 0) {
    return new EmbedBuilder()
      .setTitle('🔥 Special Offers')
      .setDescription('*No special offers configured.*')
      .setColor(SETTINGS_COLOR);
  }

  const now = Date.now();
  const lines = offers.map(o => {
    const expired = o.endAt !== undefined && o.endAt < now;
    const notStarted = o.startAt !== undefined && o.startAt > now;
    const status = !o.enabled || expired ? '❌' : notStarted ? '⏰' : '✅';
    const typeStr = { flash_sale: '⚡ Flash Sale', bundle: '📦 Bundle', featured: '⭐ Featured' }[o.type] ?? o.type;
    return `${status} **${o.name}** — ${typeStr}${o.discountPercent ? ` (-${o.discountPercent}%)` : ''}`;
  });

  return new EmbedBuilder()
    .setTitle('🔥 Special Offers')
    .setDescription(lines.join('\n'))
    .setColor(SETTINGS_COLOR)
    .setFooter({ text: `${offers.length} offer(s)` });
}

export function buildOffersSectionComponents(): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:ss:of:add')
      .setLabel('Add Offer')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('st:ss:home')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

// ── Log Channels Section ──────────────────────────────────────────────────────

export function buildLogsSettingsEmbed(settings: StoreSettings): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📋 Log Channels')
    .setDescription(
      `Configure channels where store events are logged.\n\n` +
      `**📝 Audit Log:** ${settings.auditLogChannelId ? `<#${settings.auditLogChannelId}>` : '*Not set*'}\n` +
      `**⚠️ Low Stock Alerts:** ${settings.lowStockAlertChannelId ? `<#${settings.lowStockAlertChannelId}>` : '*Not set*'}`,
    )
    .setColor(SETTINGS_COLOR);
}

export function buildLogsSettingsComponents(): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('st:ss:logs:setaudit')
      .setLabel('Set Audit Log Channel')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:logs:setlowstock')
      .setLabel('Set Low Stock Alert Channel')
      .setEmoji('⚠️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('st:ss:home')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

export function buildSetChannelModal(channelType: 'audit' | 'lowstock'): ModalBuilder {
  const label = channelType === 'audit' ? 'Audit Log' : 'Low Stock Alert';
  return new ModalBuilder()
    .setCustomId(`st:modal:ss:logs:${channelType}`)
    .setTitle(`Set ${label} Channel`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('channel_id')
          .setLabel('Channel ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(25)
          .setPlaceholder('Right-click channel → Copy ID'),
      ),
    );
}

// ── General Settings ──────────────────────────────────────────────────────────

export function buildGeneralSettingsModal(settings: StoreSettings): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('st:modal:ss:general')
    .setTitle('General Store Settings')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('default_currency')
          .setLabel('Default Currency')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(settings.defaultCurrency)
          .setMaxLength(20)
          .setPlaceholder('e.g. coins'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('max_orders')
          .setLabel('Max Orders Per User (0 = unlimited)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String(settings.maxOrdersPerUser))
          .setMaxLength(5)
          .setPlaceholder('0'),
      ),
    );
}
