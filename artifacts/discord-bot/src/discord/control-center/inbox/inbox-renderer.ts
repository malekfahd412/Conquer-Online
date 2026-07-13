// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Discord UI Renderer
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import type {
  InboxConversation,
  InboxMessage,
  InboxAttachment,
  InboxSortMode,
  InboxFilterMode,
  QuickReply,
} from '../../../community/inbox';
import { SI } from './inbox-ids';
import { CC } from '../cc-ids';

// ── Layout constants ──────────────────────────────────────────────────────────
const CONVS_PER_PAGE  = 6;
const MSGS_PER_PAGE   = 6;
const CONTENT_PREVIEW = 180;
const CONTENT_FULL    = 900;

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function relTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)    return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function discordTs(ts: number): string {
  return `<t:${Math.floor(ts / 1000)}:f>`;
}

function discordRel(ts: number): string {
  return `<t:${Math.floor(ts / 1000)}:R>`;
}

/** ✓ Seen / 🔵 Unread + last-seen timestamp — the "Read Receipt" line for a conversation. */
function readReceiptLine(conv: InboxConversation): string {
  if (conv.isRead) {
    return conv.lastSeenAt ? `✅ Seen · Last seen ${discordRel(conv.lastSeenAt)}` : '✅ Seen';
  }
  return conv.lastSeenAt ? `🔵 Unread · Last seen ${discordRel(conv.lastSeenAt)}` : '🔵 Unread · Never seen';
}

function isImageAttachment(a: InboxAttachment): boolean {
  if (a.contentType) return a.contentType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp)$/i.test(a.name);
}

function isVideoAttachment(a: InboxAttachment): boolean {
  if (a.contentType) return a.contentType.startsWith('video/');
  return /\.(mp4|mov|webm|mkv)$/i.test(a.name);
}

const MAX_EXTRA_EMBEDS = 6;
const MAX_DOWNLOAD_BUTTONS = 5;

/**
 * Builds extra embeds for image attachments + preserved original embeds so
 * staff see rich previews inline, not just links. Capped to stay well under
 * Discord's 10-embeds-per-message limit alongside the main list/conversation embed.
 */
function buildAttachmentEmbeds(messages: InboxMessage[]): EmbedBuilder[] {
  const extras: EmbedBuilder[] = [];

  // Walk newest-first so the most recent media takes priority if capped.
  for (const msg of [...messages].reverse()) {
    for (const snap of msg.embedSnapshots ?? []) {
      if (extras.length >= MAX_EXTRA_EMBEDS) return extras;
      const eb = new EmbedBuilder().setColor(snap.color ?? 0x2b2d31);
      if (snap.title) eb.setTitle(trunc(snap.title, 256));
      if (snap.description) eb.setDescription(trunc(snap.description, 500));
      if (snap.url) eb.setURL(snap.url);
      if (snap.imageUrl) eb.setImage(snap.imageUrl);
      if (snap.thumbnailUrl) eb.setThumbnail(snap.thumbnailUrl);
      if (snap.authorName) eb.setAuthor({ name: snap.authorName });
      if (snap.footerText) eb.setFooter({ text: snap.footerText });
      extras.push(eb);
    }
    for (const att of msg.attachments) {
      if (extras.length >= MAX_EXTRA_EMBEDS) return extras;
      if (isImageAttachment(att)) {
        extras.push(new EmbedBuilder().setColor(0x2b2d31).setTitle(trunc(att.name, 100)).setImage(att.url));
      }
    }
  }

  return extras;
}

/** A single row of "⬇️ filename" link buttons for non-image attachments (videos/files). */
function buildAttachmentDownloadRow(messages: InboxMessage[]): ActionRowBuilder<ButtonBuilder> | null {
  const buttons: ButtonBuilder[] = [];

  for (const msg of [...messages].reverse()) {
    for (const att of msg.attachments) {
      if (buttons.length >= MAX_DOWNLOAD_BUTTONS) break;
      if (isImageAttachment(att)) continue;
      buttons.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(att.url)
          .setLabel(trunc(`${isVideoAttachment(att) ? '🎬' : '📎'} ${att.name}`, 80)),
      );
    }
    if (buttons.length >= MAX_DOWNLOAD_BUTTONS) break;
  }

  if (buttons.length === 0) return null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

function statusBadge(conv: InboxConversation): string {
  const parts: string[] = [];
  if (!conv.isRead)             parts.push('🔵 **UNREAD**');
  if (conv.isPinned)            parts.push('📌 Pinned');
  if (conv.status === 'closed') parts.push('🔒 Closed');
  if (conv.assignedTo)          parts.push(`👤 ${conv.assignedToTag ?? 'Staff'}`);
  return parts.join(' · ');
}

function msgTypeIcon(msg: InboxMessage): string {
  if (msg.type === 'staff_note')  return '📝';
  if (msg.type === 'staff_reply') return '💬';
  return '👤';
}

function msgHeader(msg: InboxMessage): string {
  const icon   = msgTypeIcon(msg);
  const edited = msg.isEdited ? ' *(edited)*' : '';
  const ts     = relTime(msg.timestamp);
  if (msg.type === 'staff_note')  return `${icon} **[PRIVATE NOTE]** ${msg.authorTag}${edited} · ${ts}`;
  if (msg.type === 'staff_reply') return `${icon} **[STAFF]** ${msg.authorTag}${edited} · ${ts}`;
  return `${icon} **${msg.authorTag}**${edited} · ${ts}`;
}

function msgBody(msg: InboxMessage): string {
  const parts: string[] = [];

  if (msg.replyToContent) {
    parts.push(`> ${trunc(msg.replyToContent, 100)}`);
  }

  if (msg.content) {
    parts.push(trunc(msg.content, CONTENT_FULL));
  }

  const extras: string[] = [];
  if (msg.attachments.length > 0) {
    extras.push(`📎 ${msg.attachments.map(a => `[${a.name}](${a.url})`).join(', ')}`);
  }
  if (msg.hasEmbeds)   extras.push('🖼️ *embed*');
  if (msg.hasStickers) extras.push('🎉 *sticker*');
  if (extras.length)   parts.push(extras.join(' · '));

  return parts.join('\n') || '*[empty message]*';
}

// ── Inbox List ────────────────────────────────────────────────────────────────

export function buildInboxList(
  convs: InboxConversation[],
  sort: InboxSortMode,
  filter: InboxFilterMode,
  page: number,
  totalUnread: number,
): { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const totalPages = Math.max(1, Math.ceil(convs.length / CONVS_PER_PAGE));
  const safePage   = Math.max(0, Math.min(page, totalPages - 1));
  const slice      = convs.slice(safePage * CONVS_PER_PAGE, (safePage + 1) * CONVS_PER_PAGE);

  const unreadBadge = totalUnread > 0 ? ` (${totalUnread} unread)` : '';
  const sortLabel   = { newest: 'Newest First', oldest: 'Oldest First', unread: 'Unread First' }[sort];
  const filterLabel = { all: 'All', unread: 'Unread', pinned: 'Pinned', archived: 'Archived' }[filter];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📥 Support Inbox${unreadBadge}`)
    .setDescription(
      `**${convs.length}** conversation${convs.length !== 1 ? 's' : ''} · ` +
      `Sort: **${sortLabel}** · Filter: **${filterLabel}** · ` +
      `Page ${safePage + 1}/${totalPages}`,
    );

  if (slice.length === 0) {
    embed.addFields({
      name: 'No conversations',
      value: 'No DMs captured yet, or no results for this filter.\nSend a DM to the bot to test.',
    });
  } else {
    for (const conv of slice) {
      const lastMsg = conv.messages.filter(m => m.type !== 'staff_note').at(-1);
      const preview = lastMsg ? trunc(lastMsg.content || '*(attachment)*', CONTENT_PREVIEW) : '*No messages*';
      const badge   = statusBadge(conv);
      const tags    = conv.tags.length ? `🏷️ ${conv.tags.join(', ')}` : '';
      const receipt = readReceiptLine(conv);
      const lines   = [preview, badge, receipt, tags].filter(Boolean);

      embed.addFields({
        name: `${conv.isRead ? '⚪' : '🔵'} ${conv.userTag} · ${relTime(conv.lastMessageAt)}`,
        value: lines.join('\n') || '*Empty*',
      });
    }
  }

  embed.setFooter({ text: 'Use the numbered buttons below to open a conversation' });

  // ── Action rows ───────────────────────────────────────────────────────────
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Rows 1–2: Conversation buttons (up to 10, split across 2 rows of 5)
  if (slice.length > 0) {
    const convButtons = slice.map((conv, i) =>
      new ButtonBuilder()
        .setCustomId(SI.view(conv.userId, 0))
        .setLabel(`${i + 1}. ${trunc(conv.userTag.split('#')[0] ?? conv.userTag, 18)}`)
        .setStyle(conv.isRead ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setEmoji(conv.isPinned ? '📌' : conv.status === 'closed' ? '🔒' : '👤'),
    );
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(convButtons.slice(0, 5)));
    if (convButtons.length > 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(convButtons.slice(5)));
    }
  }

  // Pagination + search + DM + home
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.list(sort, filter, safePage - 1))
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(SI.list(sort, filter, safePage + 1))
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(SI.SEARCH)
        .setLabel('🔍 Search')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.DM_OPEN)
        .setLabel('✉️ Message User')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CC.HOME)
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Sort + filter toggles
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.list('newest', filter, 0))
        .setLabel('⬇ Newest')
        .setStyle(sort === 'newest' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.list('oldest', filter, 0))
        .setLabel('⬆ Oldest')
        .setStyle(sort === 'oldest' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.list('unread', filter, 0))
        .setLabel('🔵 Unread')
        .setStyle(sort === 'unread' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.list(sort, filter === 'pinned' ? 'all' : 'pinned', 0))
        .setLabel('📌 Pinned')
        .setStyle(filter === 'pinned' ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.list(sort, filter === 'archived' ? 'all' : 'archived', 0))
        .setLabel('🗄 Archived')
        .setStyle(filter === 'archived' ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );

  // Quick reply management (only room for this row when conv buttons don't already fill 2 rows + the 2 above)
  if (rows.length < 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(SI.qrManage(0))
          .setLabel('⚡ Quick Replies')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return { content: '', embeds: [embed], components: rows };
}

// ── Conversation View ─────────────────────────────────────────────────────────

export function buildConversationView(
  conv: InboxConversation,
  page: number,
  sort: InboxSortMode = 'newest',
  filter: InboxFilterMode = 'all',
): { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const allMsgs    = [...conv.messages];
  const totalPages = Math.max(1, Math.ceil(allMsgs.length / MSGS_PER_PAGE));
  const safePage   = Math.max(0, Math.min(page, totalPages - 1));
  const slice      = allMsgs.slice(safePage * MSGS_PER_PAGE, (safePage + 1) * MSGS_PER_PAGE);

  const assignedLine = conv.assignedTo ? `Assigned: ${conv.assignedToTag}` : 'Unassigned';
  const tagsLine     = conv.tags.length ? `Tags: ${conv.tags.join(', ')}` : '';

  const embed = new EmbedBuilder()
    .setColor(conv.status === 'closed' ? 0x99aab5 : conv.isRead ? 0x57f287 : 0x5865f2)
    .setTitle(`${conv.status === 'closed' ? '🔒' : '🟢'} ${conv.userTag}`)
    .setDescription(
      [
        `**User ID:** \`${conv.userId}\``,
        `**Status:** ${conv.status === 'closed' ? '🔒 Closed' : '🟢 Open'} · ${assignedLine}`,
        readReceiptLine(conv),
        tagsLine,
        `**Started:** ${discordTs(conv.createdAt)} · **Messages:** ${conv.messages.length}`,
        `**Page:** ${safePage + 1}/${totalPages}`,
      ].filter(Boolean).join('\n'),
    );

  if (conv.userAvatar) embed.setThumbnail(conv.userAvatar);

  if (slice.length === 0) {
    embed.addFields({ name: 'No messages', value: 'This conversation has no messages yet.' });
  } else {
    for (const msg of slice) {
      embed.addFields({
        name: trunc(msgHeader(msg), 256),
        value: trunc(msgBody(msg), 1020),
      });
    }
  }

  const mediaEmbeds = buildAttachmentEmbeds(slice);
  const allEmbeds   = [embed, ...mediaEmbeds];

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Row 1: Pagination + back
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.view(conv.userId, safePage - 1))
        .setLabel('◀ Older')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(SI.view(conv.userId, safePage + 1))
        .setLabel('Newer ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(SI.list(sort, filter, 0))
        .setLabel('⬅️ Inbox')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CC.HOME)
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Row 2: Reply + quick reply + note + read + close/reopen
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.reply(conv.userId))
        .setLabel('💬 Reply')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(conv.status === 'closed'),
      new ButtonBuilder()
        .setCustomId(SI.qrPick(conv.userId))
        .setLabel('⚡ Quick Reply')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(conv.status === 'closed'),
      new ButtonBuilder()
        .setCustomId(SI.note(conv.userId))
        .setLabel('📝 Note')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.read(conv.userId))
        .setLabel(conv.isRead ? '🔵 Unread' : '✅ Read')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(conv.status === 'closed' ? SI.reopen(conv.userId) : SI.close(conv.userId))
        .setLabel(conv.status === 'closed' ? '🔓 Reopen' : '🔒 Close')
        .setStyle(conv.status === 'closed' ? ButtonStyle.Success : ButtonStyle.Danger),
    ),
  );

  // Row 3: Pin + archive + assign + tag
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.pin(conv.userId))
        .setLabel(conv.isPinned ? '📌 Unpin' : '📌 Pin')
        .setStyle(conv.isPinned ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.archive(conv.userId))
        .setLabel(conv.isArchived ? '📂 Unarchive' : '🗄 Archive')
        .setStyle(conv.isArchived ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.assign(conv.userId))
        .setLabel(conv.assignedTo ? '👤 Reassign' : '👤 Assign')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.tag(conv.userId))
        .setLabel('🏷️ Tag')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Row 4: AI tools
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.aiSuggest(conv.userId))
        .setLabel('🤖 Suggest')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.aiSummarize(conv.userId))
        .setLabel('📋 Summarize')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.aiTranslate(conv.userId))
        .setLabel('🌐 Translate')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(SI.aiRewrite(conv.userId))
        .setLabel('✨ Rewrite')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Row 5 (if room): download links for video/file attachments on this page
  if (rows.length < 5) {
    const downloadRow = buildAttachmentDownloadRow(slice);
    if (downloadRow) rows.push(downloadRow);
  }

  return { content: '', embeds: allEmbeds, components: rows };
}

// ── Search Results ────────────────────────────────────────────────────────────

export function buildSearchResults(
  convs: InboxConversation[],
  query: string,
  sort: InboxSortMode,
  filter: InboxFilterMode,
): { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`🔍 Search Results — "${trunc(query, 50)}"`)
    .setDescription(`Found **${convs.length}** conversation${convs.length !== 1 ? 's' : ''}.`);

  for (const conv of convs.slice(0, 10)) {
    const lastMsg = conv.messages.filter(m => m.type !== 'staff_note').at(-1);
    embed.addFields({
      name: `${conv.isRead ? '⚪' : '🔵'} ${conv.userTag} · ${relTime(conv.lastMessageAt)}`,
      value: lastMsg ? trunc(lastMsg.content || '*(attachment)*', 150) : '*No messages*',
    });
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (convs.length > 0) {
    const convButtons = convs.slice(0, 5).map((conv, i) =>
      new ButtonBuilder()
        .setCustomId(SI.view(conv.userId, 0))
        .setLabel(`${i + 1}. ${trunc(conv.userTag.split('#')[0] ?? conv.userTag, 18)}`)
        .setStyle(ButtonStyle.Primary),
    );
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(convButtons));
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.SEARCH)
        .setLabel('🔍 Search Again')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(SI.list(sort, filter, 0))
        .setLabel('⬅️ Back to Inbox')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CC.HOME)
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { content: '', embeds: [embed], components: rows };
}

// ── AI Result ─────────────────────────────────────────────────────────────────

export function buildAIResult(
  conv: InboxConversation,
  title: string,
  result: string,
  sort: InboxSortMode,
  filter: InboxFilterMode,
): { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🤖 ${title}`)
    .setDescription(trunc(result, 4000));

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(SI.view(conv.userId, 0))
          .setLabel('⬅️ Back to Conversation')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(SI.list(sort, filter, 0))
          .setLabel('📥 Inbox')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(CC.HOME)
          .setLabel('🏠 Home')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ── Modals ────────────────────────────────────────────────────────────────────

export function buildReplyModal(userId: string, prefill?: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Your reply (sent as bot DM)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1900)
    .setPlaceholder('Type your reply here…');
  if (prefill) input.setValue(trunc(prefill, 1900));

  return new ModalBuilder()
    .setCustomId(SI.replySubmit(userId))
    .setTitle('Reply to User')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export function buildNoteModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.noteSubmit(userId))
    .setTitle('Add Private Staff Note')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Note (private — never shown to user)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1900)
          .setPlaceholder('Internal note for staff only…'),
      ),
    );
}

export function buildTagModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.tagSubmit(userId))
    .setTitle('Add Tag')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('tag')
          .setLabel('Tag name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('e.g. bug, billing, vip'),
      ),
    );
}

export function buildSearchModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.SEARCH_SUBMIT)
    .setTitle('Search Inbox')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Username, User ID, or keyword')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder('Search by username, user ID, or message content…'),
      ),
    );
}

export function buildDMComposerModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.DM_SUBMIT)
    .setTitle('Message a User by ID')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('User ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
          .setPlaceholder('e.g. 123456789012345678'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1900)
          .setPlaceholder('Type the message to send…'),
      ),
    );
}

export function buildRewriteModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.aiRewriteSubmit(userId))
    .setTitle('Rewrite Reply Professionally')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('draft')
          .setLabel('Your draft reply')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setPlaceholder('Paste your rough reply here and AI will polish it…'),
      ),
    );
}

// ── Quick Replies ─────────────────────────────────────────────────────────────

// Capped at 5 so every reply on a page gets its own Edit/Delete button (Discord allows max 5 buttons per row).
const QR_PER_PAGE = 5;

/** String-select picker shown when staff clicks "⚡ Quick Reply" on a conversation. */
export function buildQuickReplyPicker(
  uid: string,
  replies: QuickReply[],
): { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] } {
  if (replies.length === 0) {
    return buildInfoEmbed(
      'ℹ️ No Quick Replies Yet',
      'No saved replies have been configured.\nUse **⚡ Quick Replies** from the inbox home to add one.',
      0x99aab5,
      SI.view(uid, 0),
      '⬅️ Back',
    ) as { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SI.qrUse(uid))
    .setPlaceholder('Choose a quick reply to insert…')
    .addOptions(
      replies.slice(0, 25).map(r => ({
        label: trunc(r.title, 100),
        value: r.id,
        description: trunc(r.content.replace(/\s+/g, ' '), 100),
      })),
    );

  return {
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('⚡ Quick Replies')
        .setDescription('Pick a saved reply below — it will open the reply box pre-filled so you can tweak it before sending.'),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(SI.view(uid, 0)).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
      ),
    ] as unknown as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[],
  };
}

/** Management screen for saved quick replies, opened from the Support Inbox home. */
export function buildQuickReplyManager(
  replies: QuickReply[],
  page: number,
): { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const totalPages = Math.max(1, Math.ceil(replies.length / QR_PER_PAGE));
  const safePage    = Math.max(0, Math.min(page, totalPages - 1));
  const slice       = replies.slice(safePage * QR_PER_PAGE, (safePage + 1) * QR_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚡ Quick Replies — Manage')
    .setDescription(
      `**${replies.length}** saved repl${replies.length === 1 ? 'y' : 'ies'} · Page ${safePage + 1}/${totalPages}\n` +
      'Placeholders: `{user}` `{server}` `{ticket}` `{staff}`',
    );

  if (slice.length === 0) {
    embed.addFields({ name: 'No quick replies', value: 'Click **➕ Add** below to create your first saved reply.' });
  } else {
    for (const r of slice) {
      embed.addFields({ name: `💬 ${trunc(r.title, 100)}`, value: trunc(r.content, 500) });
    }
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (slice.length > 0) {
    const editButtons = slice.map((r, i) =>
      new ButtonBuilder().setCustomId(SI.qrEdit(r.id)).setLabel(`✏️ ${i + 1}`).setStyle(ButtonStyle.Secondary),
    );
    const delButtons = slice.map((r, i) =>
      new ButtonBuilder().setCustomId(SI.qrDelete(r.id)).setLabel(`🗑️ ${i + 1}`).setStyle(ButtonStyle.Danger),
    );
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(editButtons.slice(0, 5)));
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(delButtons.slice(0, 5)));
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.qrManage(safePage - 1))
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(SI.qrManage(safePage + 1))
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
      new ButtonBuilder().setCustomId(SI.QR_ADD).setLabel('➕ Add').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(SI.HOME).setLabel('⬅️ Inbox').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(CC.HOME).setLabel('🏠 Home').setStyle(ButtonStyle.Secondary),
    ),
  );

  return { content: '', embeds: [embed], components: rows };
}

export function buildQuickReplyAddModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.QR_ADD_SUBMIT)
    .setTitle('Add Quick Reply')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Title (shown in the picker)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setPlaceholder('e.g. Refund Policy'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Reply text')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1900)
          .setPlaceholder('Hi {user}, thanks for reaching out to {server}…'),
      ),
    );
}

export function buildQuickReplyEditModal(reply: QuickReply): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.qrEditSubmit(reply.id))
    .setTitle('Edit Quick Reply')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Title (shown in the picker)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setValue(reply.title),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Reply text')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1900)
          .setValue(reply.content),
      ),
    );
}

// ── Simple embed helpers ──────────────────────────────────────────────────────

export function buildInfoEmbed(
  title: string,
  description: string,
  color: number,
  backId: string,
  backLabel = '⬅️ Back',
): { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  return {
    content: '',
    embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description)],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(backId).setLabel(backLabel).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CC.HOME).setLabel('🏠 Home').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
