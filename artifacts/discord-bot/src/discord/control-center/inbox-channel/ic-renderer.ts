// ─────────────────────────────────────────────────────────────────────────────
// Discord-Native Support Inbox — Renderer
// Builds the dashboard embed, per-thread control panel, and mirrored message
// embeds for inbound user DMs (staff replies are native thread messages —
// Discord already renders their avatar/name/timestamp for free).
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Message,
} from 'discord.js';
import type { InboxConversation, InboxAttachment } from '../../../community/inbox';
import { IC } from './ic-ids';

const BRAND_COLOR   = 0x5865f2;
const USER_MSG_COLOR = 0x2b2d31;
const CLOSED_COLOR  = 0xed4245;
const AI_COLOR      = 0x9b59b6;

function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function isImageAttachment(a: InboxAttachment): boolean {
  if (a.contentType) return a.contentType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp)$/i.test(a.name);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
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

// ── Thread control panel (pinned at the top of every conversation thread) ─────

export function buildThreadControlPanel(conv: InboxConversation): DashboardPayload {
  const embed = new EmbedBuilder()
    .setColor(conv.status === 'closed' ? CLOSED_COLOR : BRAND_COLOR)
    .setAuthor({ name: conv.userTag, iconURL: conv.userAvatar || undefined })
    .setTitle(conv.status === 'closed' ? '🔒 Conversation Closed' : '💬 Live DM Conversation')
    .setDescription(
      [
        `Just type in this thread — every message you send here is delivered straight to **${conv.userTag}**'s DMs.`,
        `Need to jot something down without the user seeing it? Start your message with \`!note \` or use **📝 Internal Note** below.`,
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
    new ButtonBuilder().setCustomId(IC.ai(conv.userId)).setLabel('AI Assist').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IC.voice(conv.userId)).setLabel('Voice Support').setEmoji('📞').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IC.summary(conv.userId)).setLabel('Summary').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    conv.status === 'closed'
      ? new ButtonBuilder().setCustomId(IC.reopen(conv.userId)).setLabel('Reopen').setEmoji('🔓').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(IC.close(conv.userId)).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Mirrored inbound user DM ─────────────────────────────────────────────────

/** Renders a user's DM as a clean embed inside their thread (avatar, name, timestamp, attachments). */
export function buildUserMessageEmbeds(message: Message): EmbedBuilder[] {
  const attachments = [...message.attachments.values()];
  const images = attachments.filter(a => isImageAttachment({ name: a.name ?? '', url: a.url, contentType: a.contentType ?? undefined }));
  const others = attachments.filter(a => !images.includes(a));

  const main = new EmbedBuilder()
    .setColor(USER_MSG_COLOR)
    .setAuthor({ name: `${message.author.tag} · DM`, iconURL: message.author.displayAvatarURL({ size: 128 }) })
    .setDescription(message.content ? trunc(message.content, 3800) : (attachments.length ? '_(attachment only)_' : '_(empty message)_'))
    .setTimestamp(message.createdAt);

  if (images[0]) main.setImage(images[0].url);
  if (others.length) {
    main.addFields({
      name: `📎 Attachments (${others.length})`,
      value: others.slice(0, 10).map(a => `[${trunc(a.name ?? 'file', 60)}](${a.url})`).join('\n'),
    });
  }

  const extraImageEmbeds = images.slice(1, 5).map(img =>
    new EmbedBuilder().setColor(USER_MSG_COLOR).setImage(img.url),
  );

  return [main, ...extraImageEmbeds];
}

// ── Modals (ic:* namespace, mirrors si:* reply/note modals for the thread flow) ──

export function buildReplyModal(uid: string, prefill?: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Reply to send to the user\'s DM')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);
  if (prefill) input.setValue(trunc(prefill, 2000));
  return new ModalBuilder()
    .setCustomId(IC.replySubmit(uid))
    .setTitle('Reply to User')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
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

// ── AI / Summary result embeds (posted natively in-thread, visible to all staff) ──

export function buildAIAssistEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: '🤖 AI Assist — Suggested Reply' })
    .setDescription(trunc(text, 3800))
    .setFooter({ text: 'Copy, edit, and send as your own reply — nothing here goes to the user automatically.' });
}

export function buildSummaryEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(AI_COLOR)
    .setAuthor({ name: '📋 Conversation Summary' })
    .setDescription(trunc(text, 3800));
}

export function buildSystemNoteEmbed(text: string, color: number = BRAND_COLOR): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setDescription(text);
}
