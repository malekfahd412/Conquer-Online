// ─────────────────────────────────────────────────────────────────────────────
// Payment Renderer — builds Discord UI for payment method selection,
// proof submission modals, and proof review panels.
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
import type { PaymentMethod, StoreOrder, StoreProduct, PaymentProof } from '../models/index.js';

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

// ── Payment Method Selection ─────────────────────────────────────────────────

export function buildPaymentSelectEmbed(order: StoreOrder, product: StoreProduct): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('💳 Select Payment Method')
    .setDescription(
      `**Order:** ${order.orderId}\n` +
      `**Product:** ${product.name}\n` +
      `**Total:** ${order.totalPrice.toLocaleString()} ${product.currency}` +
      (order.discountAmount > 0 ? `\n**Discount:** -${order.discountAmount.toLocaleString()} ${product.currency} 🎉` : ''),
    )
    .setColor(0xf5a623)
    .setFooter({ text: 'Choose how you would like to pay' });
}

export function buildPaymentSelectComponents(methods: PaymentMethod[], orderId: string): AnyRow[] {
  if (methods.length === 0) return [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`st:pm:select:${orderId}`)
    .setPlaceholder('Choose a payment method…')
    .addOptions(
      methods.slice(0, 25).map(m =>
        new StringSelectMenuOptionBuilder()
          .setValue(m.id)
          .setLabel(`${m.icon} ${m.name}`)
          .setDescription(m.instructions.slice(0, 100)),
      ),
    );

  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)];
}

// ── Payment Instructions ─────────────────────────────────────────────────────

export function buildPaymentInstructionsEmbed(
  method: PaymentMethod,
  order: StoreOrder,
  product: StoreProduct,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${method.icon} ${method.name} — Payment Instructions`)
    .setDescription(method.instructions)
    .setColor(method.color)
    .addFields(
      { name: '📋 Order ID', value: order.orderId, inline: true },
      { name: '💰 Amount', value: `${order.totalPrice.toLocaleString()} ${product.currency}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
    )
    .setFooter({ text: 'After paying, press "Submit Proof" to confirm your payment.' });

  const requiredProof: string[] = [];
  if (method.requiresScreenshot) requiredProof.push('📸 Screenshot');
  if (method.requiresTransactionId) requiredProof.push('🔢 Transaction ID');
  if (method.requiresPhone) requiredProof.push('📱 Phone Number');
  if (method.requiresWallet) requiredProof.push('👛 Wallet Address');
  if (method.requiresCharacter) requiredProof.push('🎮 Character Name');
  if (method.requiresNotes) requiredProof.push('📝 Notes');

  if (requiredProof.length > 0) {
    embed.addFields({ name: '📎 Required Proof', value: requiredProof.join('\n') });
  }

  if (method.qrImageUrl) embed.setImage(method.qrImageUrl);

  return embed;
}

export function buildPaymentInstructionsComponents(orderId: string, methodId: string): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:pr:submit:${orderId}`)
      .setLabel('Submit Payment Proof')
      .setEmoji('📎')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`st:pm:change:${orderId}`)
      .setLabel('Change Method')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
  void methodId;
  return [row];
}

// ── Proof Submission Modal ───────────────────────────────────────────────────

export function buildProofModal(orderId: string, method: PaymentMethod): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`st:modal:proof:${orderId}`)
    .setTitle(`Submit Payment Proof — ${method.name.slice(0, 30)}`);

  const components: ActionRowBuilder<TextInputBuilder>[] = [];

  if (method.requiresTransactionId) {
    components.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('transaction_id')
          .setLabel('Transaction ID / Reference Number')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter the transaction or reference ID')
          .setRequired(method.requiresTransactionId)
          .setMaxLength(200),
      ),
    );
  }

  if (method.requiresPhone) {
    components.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('phone')
          .setLabel('Phone Number Used')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter the phone number you paid from')
          .setRequired(method.requiresPhone)
          .setMaxLength(30),
      ),
    );
  }

  if (method.requiresWallet) {
    components.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('wallet')
          .setLabel('Your Wallet Address / From Address')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter the wallet address you sent from')
          .setRequired(method.requiresWallet)
          .setMaxLength(200),
      ),
    );
  }

  if (method.requiresCharacter) {
    components.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('character')
          .setLabel('In-Game Character Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Your character name for delivery')
          .setRequired(method.requiresCharacter)
          .setMaxLength(100),
      ),
    );
  }

  // Notes field (always last, required only if method.requiresNotes)
  if (components.length < 5) {
    components.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Additional Notes')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(method.requiresScreenshot ? 'Add any extra notes here (attach screenshot after submitting)' : 'Any additional payment details')
          .setRequired(method.requiresNotes && !method.requiresScreenshot)
          .setMaxLength(500),
      ),
    );
  }

  // Always include at least one field
  if (components.length === 0) {
    components.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Payment Notes')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe your payment (amount, method, time, etc.)')
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
  }

  modal.addComponents(...components.slice(0, 5));
  return modal;
}

// ── Proof Submitted (Buyer View) ─────────────────────────────────────────────

export function buildProofSubmittedEmbed(orderId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📎 Payment Proof Submitted')
    .setDescription(
      `Your payment proof for **${orderId}** has been submitted.\n\n` +
      'Staff will review it shortly. You will be notified once approved.\n\n' +
      '> If you have a screenshot to attach, **send it as a message in this channel**.',
    )
    .setColor(0x57f287)
    .setTimestamp();
}

// ── Proof Review (Staff View) ────────────────────────────────────────────────

export function buildProofReviewEmbed(order: StoreOrder, proof: PaymentProof): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🔍 Payment Proof Review')
    .setColor(0xffd700)
    .addFields(
      { name: '📋 Order ID', value: order.orderId, inline: true },
      { name: '👤 Buyer', value: `<@${order.userId}>`, inline: true },
      { name: '⏰ Submitted', value: `<t:${Math.floor(proof.submittedAt / 1000)}:R>`, inline: true },
    );

  if (proof.transactionId) embed.addFields({ name: '🔢 Transaction ID', value: proof.transactionId, inline: true });
  if (proof.amount !== undefined) embed.addFields({ name: '💰 Amount Declared', value: String(proof.amount), inline: true });
  if (proof.paymentTime) embed.addFields({ name: '🕐 Payment Time', value: proof.paymentTime, inline: true });
  if (proof.notes) embed.addFields({ name: '📝 Notes', value: proof.notes });
  if (proof.attachmentUrls.length > 0) {
    embed.addFields({ name: '📸 Attachments', value: proof.attachmentUrls.map((u, i) => `[Screenshot ${i + 1}](${u})`).join('\n') });
    embed.setImage(proof.attachmentUrls[0]);
  }

  if (proof.reviewDecision) {
    const statusMap: Record<string, string> = {
      approved: '✅ Approved',
      rejected: '❌ Rejected',
      more_info: '⚠️ More Info Requested',
    };
    embed.addFields(
      { name: '📊 Review Decision', value: statusMap[proof.reviewDecision] ?? proof.reviewDecision, inline: true },
      { name: '👮 Reviewed By', value: proof.reviewedBy ? `<@${proof.reviewedBy}>` : 'Unknown', inline: true },
    );
    if (proof.reviewNotes) embed.addFields({ name: '💬 Review Notes', value: proof.reviewNotes });
  }

  return embed;
}

export function buildProofReviewComponents(orderId: string): AnyRow[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`st:pr:approve:${orderId}`)
      .setLabel('Approve')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`st:pr:reject:${orderId}`)
      .setLabel('Reject')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`st:pr:moreinfo:${orderId}`)
      .setLabel('Request More Info')
      .setEmoji('⚠️')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

// ── Proof Review Modal (for rejection/more-info reason) ──────────────────────

export function buildProofReviewModal(orderId: string, action: 'reject' | 'moreinfo'): ModalBuilder {
  const title = action === 'reject' ? 'Reject Payment Proof' : 'Request More Information';
  return new ModalBuilder()
    .setCustomId(`st:modal:prreview:${orderId}:${action}`)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel(action === 'reject' ? 'Reason for Rejection' : 'What additional info is needed?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(action === 'reject' ? 'Explain why the proof was rejected' : 'Describe what the buyer needs to provide')
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
}
