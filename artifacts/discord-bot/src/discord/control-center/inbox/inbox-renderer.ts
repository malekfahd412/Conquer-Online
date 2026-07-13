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
} from 'discord.js';
import type { InboxConversation, InboxMessage, InboxSortMode, InboxFilterMode } from '../../../community/inbox';
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
      const lines   = [preview, badge, tags].filter(Boolean);

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

  // Row 2: Reply + note + read + close/reopen
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SI.reply(conv.userId))
        .setLabel('💬 Reply')
        .setStyle(ButtonStyle.Primary)
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

  return { content: '', embeds: [embed], components: rows };
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

export function buildReplyModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SI.replySubmit(userId))
    .setTitle('Reply to User')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Your reply (sent as bot DM)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1900)
          .setPlaceholder('Type your reply here…'),
      ),
    );
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
