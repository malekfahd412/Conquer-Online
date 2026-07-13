// ─────────────────────────────────────────────────────────────────────────────
// Discord-Native Support Inbox — Renderer
// Builds the dashboard embed, per-thread conversation header, AI sidebar,
// thread control panel, and mirrored message payloads for inbound user DMs
// (staff replies typed directly in the thread are native thread messages —
// Discord already renders their avatar/name/timestamp for free; a small
// per-reply action bar is posted alongside them for message-level actions).
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  type Message,
  type User,
  type GuildMember,
} from 'discord.js';
import type { InboxConversation, ConversationBadgeStatus, TimelineEvent } from '../../../community/inbox';
import type { TicketRecord, TicketReviewRecord } from '../../../community/tickets';
import type { Warning } from '../../../ai/tools/moderation-store';
import { IC } from './ic-ids';

const BRAND_COLOR   = 0x5865f2;
const USER_MSG_COLOR = 0x2b2d31;
const CLOSED_COLOR  = 0xed4245;
const AI_COLOR      = 0x9b59b6;

function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ── Badge status (requirement #8: Waiting for User / Waiting for Staff / Claimed / Closed / Archived) ──

const BADGE_LABELS: Record<ConversationBadgeStatus, string> = {
  archived:            '📦 Archived',
  closed:              '🔒 Closed',
  claimed:             '🙋 Claimed',
  waiting_for_staff:   '🟡 Waiting for Staff',
  waiting_for_user:    '🟢 Waiting for User',
};

const BADGE_COLORS: Record<ConversationBadgeStatus, number> = {
  archived:            0x99aab5,
  closed:              0xed4245,
  claimed:             0x5865f2,
  waiting_for_staff:   0xfee75c,
  waiting_for_user:    0x57f287,
};

export function badgeLabel(status: ConversationBadgeStatus): string {
  return BADGE_LABELS[status];
}

export function badgeColor(status: ConversationBadgeStatus): number {
  return BADGE_COLORS[status];
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

/** Same as DashboardPayload but with optional plain-text `content` shown above the embed (used for the live presence line). */
export interface ThreadPanelPayload extends DashboardPayload {
  content?: string;
}

export function buildDashboard(
  conversations: InboxConversation[],
  unreadCount: number,
  activeStaffCount: number,
): DashboardPayload {
  const open = conversations.filter(c => c.status === 'open' && !c.isArchived);
  const sorted = [...open].sort((a, b) => b.lastMessageAt - a.lastMessageAt).slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('📥 Support Inbox — Live Dashboard')
    .setDescription(
      sorted.length === 0
        ? '_No active conversations right now._'
        : sorted
            .map(c => {
              const status = !c.isRead ? '🔵' : '⚪';
              const claim  = c.assignedToTag ? ` · 👤 ${c.assignedToTag}` : '';
              const thread = c.threadId ? ` — <#${c.threadId}>` : '';
              return `${status} **${c.userTag}**${thread}${claim}\n<t:${Math.floor(c.lastMessageAt / 1000)}:R>`;
            })
            .join('\n\n'),
    )
    .addFields(
      { name: '📬 Unread Conversations', value: `${unreadCount}`, inline: true },
      { name: '🟢 Staff Active Now', value: `${activeStaffCount}`, inline: true },
      { name: '💬 Open Conversations', value: `${open.length}`, inline: true },
    )
    .setFooter({ text: 'Reply inside a conversation thread like a normal DM · /panel for search, tags & quick replies' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.DASH_REFRESH).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ── Conversation Header (requirement #1) ───────────────────────────────────────

export interface HeaderContext {
  conv: InboxConversation;
  discordUser: User | undefined;
  member: GuildMember | null;
  mutualGuildNames: string[];
  reviews: TicketReviewRecord[];
  previousTickets: TicketRecord[];
  warnings: Warning[];
  badge: ConversationBadgeStatus;
}

const TIMELINE_LABELS: Record<TimelineEvent['type'], string> = {
  created:      '🕐 Conversation Created',
  first_reply:  '💬 First Reply',
  assigned:     '👤 Assigned',
  voice_session:'📞 Voice Session',
  note:         '📝 Note Added',
  closed:       '🔒 Closed',
  reopened:     '🔓 Reopened',
};

function renderTimeline(events: TimelineEvent[]): string {
  if (!events.length) return '_No activity yet._';
  return events
    .slice(-6)
    .map(e => `${TIMELINE_LABELS[e.type]}${e.detail ? ` — ${e.detail}` : ''} · <t:${Math.floor(e.timestamp / 1000)}:R>`)
    .join('\n');
}

export function buildConversationHeader(ctx: HeaderContext): DashboardPayload {
  const { conv, discordUser, member, mutualGuildNames, reviews, previousTickets, warnings, badge } = ctx;

  const avatarUrl = discordUser?.displayAvatarURL({ size: 256 }) ?? conv.userAvatar;
  const rolesText = member
    ? (member.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => `<@&${r.id}>`).join(', ') || '_None_')
    : '_Not in this server_';

  const mutualText = mutualGuildNames.length ? mutualGuildNames.map(n => `• ${n}`).join('\n') : '_None known_';

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const reviewsText = reviews.length
    ? `**${reviews.length}** review(s), avg **${avgRating}⭐**\n` + reviews.slice(0, 2).map(r => `• ${'⭐'.repeat(r.rating)} — ${r.comment ? trunc(r.comment, 60) : '_no comment_'}`).join('\n')
    : '_No reviews yet_';

  const ticketsText = previousTickets.length
    ? `**${previousTickets.length}** total\n` + previousTickets.slice(0, 3).map(t => `• #${t.number} — ${t.ticketType} (${t.status})`).join('\n')
    : '_No previous tickets_';

  const warningsText = warnings.length
    ? `**${warnings.length}** total\n` + warnings.slice(-3).reverse().map(w => `• ${trunc(w.reason, 50)} — <t:${Math.floor(w.timestamp / 1000)}:R>`).join('\n')
    : '_No warnings_';

  const lastUserMsg = [...conv.messages].reverse().find(m => m.type === 'user');

  const embed = new EmbedBuilder()
    .setColor(badgeColor(badge))
    .setAuthor({ name: `${conv.userTag} — Conversation Header`, iconURL: avatarUrl || undefined })
    .setThumbnail(avatarUrl || null)
    .addFields(
      { name: '🏷️ Username', value: discordUser?.username ?? conv.userTag, inline: true },
      { name: '🪪 Display Name', value: member?.displayName ?? discordUser?.displayName ?? conv.userTag, inline: true },
      { name: '🔢 User ID', value: `\`${conv.userId}\``, inline: true },
      { name: '📅 Account Created', value: discordUser ? `<t:${Math.floor(discordUser.createdTimestamp / 1000)}:D>` : '_Unknown_', inline: true },
      { name: '🗓️ Joined Server', value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : '_Unknown_', inline: true },
      { name: '📛 Status', value: badgeLabel(badge), inline: true },
      { name: `🎭 Roles${member ? ` (${member.roles.cache.size - 1})` : ''}`, value: trunc(rolesText, 1000), inline: false },
      { name: `🌐 Mutual Servers (${mutualGuildNames.length})`, value: trunc(mutualText, 500), inline: true },
      { name: '⭐ Reviews', value: trunc(reviewsText, 500), inline: true },
      { name: '🎫 Previous Tickets', value: trunc(ticketsText, 500), inline: true },
      { name: '⚠️ Warnings', value: trunc(warningsText, 500), inline: false },
      { name: '🕓 User Last Active', value: lastUserMsg ? `<t:${Math.floor(lastUserMsg.timestamp / 1000)}:R>` : '_Never_', inline: true },
      { name: '📜 Timeline', value: trunc(renderTimeline(conv.timeline ?? []), 800), inline: false },
    )
    .setFooter({ text: 'Auto-updates as the conversation changes' })
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

// ── AI Sidebar (requirement #11) ────────────────────────────────────────────────

export function buildAISidebar(uid: string): DashboardPayload {
  const embed = new EmbedBuilder()
    .setColor(AI_COLOR)
    .setTitle('✨ AI Sidebar — Support Toolkit')
    .setDescription('Everything below reads the conversation and posts its result in this thread — nothing is sent to the user automatically.');

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.aiSuggest(uid)).setLabel('Suggest Reply').setEmoji('✨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.aiRewrite(uid)).setLabel('Rewrite').setEmoji('✨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.aiTranslate(uid)).setLabel('Translate').setEmoji('✨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.aiSummary(uid)).setLabel('Summarize').setEmoji('✨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.aiSentiment(uid)).setLabel('Sentiment').setEmoji('✨').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.aiFollowup(uid)).setLabel('Generate Follow-up').setEmoji('✨').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Thread control panel (pinned at the top of every conversation thread) ─────

export function buildThreadControlPanel(conv: InboxConversation, presenceLine?: string): ThreadPanelPayload {
  const embed = new EmbedBuilder()
    .setColor(conv.status === 'closed' ? CLOSED_COLOR : BRAND_COLOR)
    .setAuthor({ name: conv.userTag, iconURL: conv.userAvatar || undefined })
    .setTitle(conv.status === 'closed' ? '🔒 Conversation Closed' : '💬 Live DM Conversation')
    .setDescription(
      [
        `Just type in this thread — every message you send here is delivered straight to **${conv.userTag}**'s DMs.`,
        `Need to jot something down without the user seeing it? Start your message with \`!note \` or use **📝 Internal Note** below.`,
        `More tools (AI suggestions, translate, rewrite…) live in the pinned **✨ AI Sidebar** message.`,
      ].join('\n\n'),
    )
    .addFields(
      { name: 'User', value: `<@${conv.userId}> (\`${conv.userId}\`)`, inline: true },
      { name: 'Status', value: conv.status === 'closed' ? '🔒 Closed' : '🟢 Open', inline: true },
      { name: 'Assigned', value: conv.assignedToTag ? `👤 ${conv.assignedToTag}` : '_Unassigned_', inline: true },
    )
    .setFooter({ text: `Conversation started ${new Date(conv.createdAt).toLocaleString()}` });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.reply(conv.userId)).setLabel('Reply').setEmoji('💬').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IC.note(conv.userId)).setLabel('Internal Note').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.voice(conv.userId)).setLabel('Voice Support').setEmoji('📞').setStyle(ButtonStyle.Secondary),
    conv.status === 'closed'
      ? new ButtonBuilder().setCustomId(IC.reopen(conv.userId)).setLabel('Reopen').setEmoji('🔓').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(IC.close(conv.userId)).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1], content: presenceLine || undefined };
}

// ── Per-message action rows (requirement #4) ────────────────────────────────────

/** Row attached to the bot-authored mirrored embed for an inbound user message. */
export function buildUserMessageActionRow(uid: string, msgId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.msgPin(uid, msgId)).setEmoji('⭐').setLabel('Pin').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.msgReply(uid, msgId)).setEmoji('↩').setLabel('Reply').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IC.msgCopyId(uid, msgId)).setEmoji('📋').setLabel('Copy ID').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.aiSuggest(uid)).setEmoji('🤖').setLabel('AI Suggest Reply').setStyle(ButtonStyle.Secondary),
  );
}

export type ReceiptState = 'sent' | 'delivered' | 'seen';

export function receiptLine(state: ReceiptState): string {
  if (state === 'seen') return '✓ Sent · ✓ Delivered · ✓ Seen';
  if (state === 'delivered') return '✓ Sent · ✓ Delivered';
  return '✓ Sent';
}

/** Small companion message posted right after a staff reply is delivered, carrying message-level actions
 *  that Discord has no way to attach to a message the bot didn't author (the staff member's own thread message). */
export function buildReplyActionBar(uid: string, dmMsgId: string, staffTag: string, preview: string, receipt: ReceiptState): DashboardPayload {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setDescription(`📤 **${staffTag}**: ${trunc(preview, 200)}`)
    .setFooter({ text: receiptLine(receipt) });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.msgPin(uid, dmMsgId)).setEmoji('⭐').setLabel('Pin').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.msgEdit(uid, dmMsgId)).setEmoji('📝').setLabel('Edit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.msgDelete(uid, dmMsgId)).setEmoji('🗑').setLabel('Delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(IC.msgReply(uid, dmMsgId)).setEmoji('↩').setLabel('Reply').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IC.msgCopyId(uid, dmMsgId)).setEmoji('📋').setLabel('Copy ID').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.msgRewrite(uid, dmMsgId)).setEmoji('🤖').setLabel('AI Rewrite').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

export function buildRewritePreview(uid: string, dmMsgId: string, rewritten: string): DashboardPayload {
  const embed = new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: '🤖 AI Rewrite — Preview' })
    .setDescription(trunc(rewritten, 3800))
    .setFooter({ text: 'Apply to edit the live DM message, or ignore to leave the original reply as-is.' });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.msgRewriteApply(uid, dmMsgId)).setLabel('Apply').setEmoji('✅').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

// ── Mirrored inbound user DM ─────────────────────────────────────────────────

export interface UserMessagePayload {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
}

/** Renders a user's DM as a clean embed inside their thread (avatar, name, timestamp). Real attachments
 *  (images/video/audio/voice messages/files) are forwarded as native Discord attachments — re-uploaded
 *  from their CDN URL — so Discord renders its own inline players and download affordance for free,
 *  rather than an approximation baked into the embed. */
export function buildUserMessagePayload(message: Message): UserMessagePayload {
  const attachments = [...message.attachments.values()];
  const files = attachments.map(a => new AttachmentBuilder(a.url, { name: a.name ?? 'file' }));

  const stickers = [...message.stickers.values()];
  for (const sticker of stickers) {
    // Bots cannot forward an arbitrary guild sticker as a native Discord sticker into a DM/thread —
    // there is no API for "attach this sticker object" outside the guild that owns it — so the closest
    // native-feeling approximation is re-uploading its image asset.
    files.push(new AttachmentBuilder(sticker.url, { name: `sticker-${sticker.name}.png` }));
  }

  const voiceNote = attachments.find(a => a.waveform && a.duration != null);
  const kindNote = voiceNote
    ? '🎤 _Voice message_'
    : stickers.length && !message.content && attachments.length === 0
      ? `🏷️ _Sticker: ${stickers.map(s => s.name).join(', ')}_`
      : undefined;

  const main = new EmbedBuilder()
    .setColor(USER_MSG_COLOR)
    .setAuthor({ name: `${message.author.tag} · DM`, iconURL: message.author.displayAvatarURL({ size: 128 }) })
    .setDescription(
      message.content
        ? trunc(message.content, 3800)
        : kindNote ?? (attachments.length || stickers.length ? '_(attachment only)_' : '_(empty message)_'),
    )
    .setTimestamp(message.createdAt);

  if (kindNote && message.content) main.addFields({ name: 'Type', value: kindNote });
  if (attachments.length) {
    main.addFields({ name: `📎 Attachments (${attachments.length})`, value: attachments.slice(0, 10).map(a => `• ${trunc(a.name ?? 'file', 60)}`).join('\n') });
  }

  return { embeds: [main], files };
}

// ── Modals (ic:* namespace, mirrors si:* reply/note modals for the thread flow) ──

export function buildReplyModal(uid: string, prefill?: string, title = 'Reply to User'): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Reply to send to the user\'s DM')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);
  if (prefill) input.setValue(trunc(prefill, 2000));
  return new ModalBuilder()
    .setCustomId(IC.replySubmit(uid))
    .setTitle(title)
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

/** Reply modal opened via a message's ↩ Reply action — same submit path as buildReplyModal, just titled to show what's being quoted. */
export function buildQuoteReplyModal(uid: string, quotedSnippet: string): ModalBuilder {
  return buildReplyModal(uid, undefined, `Replying to: ${trunc(quotedSnippet, 40)}`);
}

export function buildNoteModal(uid: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(IC.noteSubmit(uid))
    .setTitle('Internal Note (staff only)')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Note — never sent to the user')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );
}

export function buildEditReplyModal(uid: string, dmMsgId: string, currentContent: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Edit the message the user sees')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true)
    .setValue(trunc(currentContent, 2000));
  return new ModalBuilder()
    .setCustomId(IC.msgEditSubmit(uid, dmMsgId))
    .setTitle('Edit Staff Reply')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export function buildAIRewriteModal(uid: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Draft text to rewrite')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(IC.aiRewriteSubmit(uid))
    .setTitle('AI Rewrite')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export function buildAITranslateModal(uid: string): ModalBuilder {
  const text = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Text to translate')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);
  const lang = new TextInputBuilder()
    .setCustomId('language')
    .setLabel('Target language (default: English)')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(40)
    .setRequired(false);
  return new ModalBuilder()
    .setCustomId(IC.aiTranslateSubmit(uid))
    .setTitle('AI Translate')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(text),
      new ActionRowBuilder<TextInputBuilder>().addComponents(lang),
    );
}

// ── AI / Summary result embeds (posted natively in-thread, visible to all staff) ──

export function buildAIAssistEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: '✨ AI Suggest Reply' })
    .setDescription(trunc(text, 3800))
    .setFooter({ text: 'Copy, edit, and send as your own reply — nothing here goes to the user automatically.' });
}

export function buildSummaryEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: '✨ Conversation Summary' })
    .setDescription(trunc(text, 3800));
}

export function buildTranslateEmbed(text: string, language: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: `✨ Translation (${language})` })
    .setDescription(trunc(text, 3800));
}

export function buildSentimentEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: '✨ Sentiment Detection' })
    .setDescription(trunc(text, 3800));
}

export function buildFollowupEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: '✨ Suggested Follow-up' })
    .setDescription(trunc(text, 3800));
}

export function buildSystemNoteEmbed(text: string, color: number = BRAND_COLOR): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setDescription(text);
}
