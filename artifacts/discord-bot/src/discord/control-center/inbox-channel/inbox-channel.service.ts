// ─────────────────────────────────────────────────────────────────────────────
// Discord-Native Support Inbox — Channel + Thread Service
//
// Adds a Discord-native "DM inbox" experience on top of the existing Support
// Inbox Pro backend (community/inbox/*) and its ephemeral /panel UI (both left
// fully intact — this is a second, additive interface onto the same data):
//
//   • A dashboard channel showing active conversations, unread count, and a
//     "staff active now" count, auto-created and remembered if not configured.
//   • One private thread per user conversation, with three pinned messages:
//       1. Conversation Header — identity/context, auto-updates.
//       2. Control Panel — Reply / Internal Note / Voice Support / Close.
//       3. AI Sidebar — Suggest / Rewrite / Translate / Summarize / Sentiment / Follow-up.
//     Inbound DMs are mirrored as clean embeds with native file attachments
//     and a small per-message action row; staff simply type in the thread and
//     their plain messages are forwarded straight to the user's DM, followed
//     by a companion action bar (Pin / Edit / Delete / Reply / Copy ID / AI Rewrite).
//
// Design notes:
//   - Threads are created as PrivateThread. Anyone with `ManageThreads` on the
//     parent channel automatically sees every private thread in it, so the
//     support-staff role is granted `ManageThreads` on the dashboard channel
//     instead of inviting each staff member to each thread individually.
//   - "Staff Active Now" / "is viewing…" / "is typing…" approximate presence
//     via staff-activity.ts / presence.ts rather than the privileged Presence
//     Intent, so this never risks breaking the bot's login if that intent
//     isn't separately approved in the Discord Developer Portal.
//   - Read receipts: "Sent"/"Delivered" are real (the DM API call succeeded);
//     true "Seen" isn't exposed by Discord for bot DMs, so it's approximated
//     as "the user has sent any message since this reply" — same
//     honesty-about-approximations pattern as staff presence.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ChannelType,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
  MessageFlags,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel,
  type ThreadChannel,
  type Interaction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type OverwriteResolvable,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
  type Typing,
} from 'discord.js';
import type { PermissionManager } from '../../../ai/permission-manager';
import {
  getConversation,
  getConversationByThreadId,
  getAllConversations,
  addStaffReply,
  addStaffNote,
  editStaffReplyContent,
  markStaffReplyDeleted,
  toggleMessagePinned,
  addTimelineEvent,
  computeBadgeStatus,
  markAsRead,
  assignTo,
  setStatus,
  setThreadId,
  setHeaderMessageId,
  setAiSidebarMessageId,
  markStaffActive,
  getActiveStaffCount,
  getTotalUnread,
  markViewing,
  markTyping,
  getOtherTypers,
  getPresenceLine,
} from '../../../community/inbox';
import type { InboxConversation, InboxMessage } from '../../../community/inbox';
import { ticketSystem } from '../../../community/tickets';
import { getWarnings } from '../../../ai/tools/moderation-store';
import {
  getInboxChannelData,
  setInboxChannel,
  setDashboardMessageId,
} from './dashboard-store';
import { IC, isICInteraction, parseMsgActionId } from './ic-ids';
import {
  buildDashboard,
  buildConversationHeader,
  buildAISidebar,
  buildThreadControlPanel,
  buildUserMessagePayload,
  buildUserMessageActionRow,
  buildReplyActionBar,
  buildRewritePreview,
  buildReplyModal,
  buildQuoteReplyModal,
  buildNoteModal,
  buildEditReplyModal,
  buildAIRewriteModal,
  buildAITranslateModal,
  buildAIAssistEmbed,
  buildSummaryEmbed,
  buildTranslateEmbed,
  buildSentimentEmbed,
  buildFollowupEmbed,
  buildSystemNoteEmbed,
  type ReceiptState as RendererReceiptState,
} from './ic-renderer';
import { getGeminiClient, AI_MODEL } from '../../../ai/gemini-client';
import { logger } from '../../../utils/logger';

const STALE = new Set([10062, 40060]);
function isStale(e: unknown): boolean {
  return !!(e && typeof e === 'object' && 'code' in e && STALE.has((e as { code: number }).code));
}

export { isICInteraction };

export class InboxChannelService {
  /** Debounce handles so a burst of DMs doesn't hammer the dashboard message with edits. */
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Debounce handles for per-thread header refreshes, keyed by thread ID. */
  private readonly headerRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Smart notification cooldown (requirement #9), keyed by conversation (= user) ID. */
  private readonly lastPingAt = new Map<string, number>();

  constructor(
    private readonly permissionManager: PermissionManager,
    private readonly supportStaffRoleId: string | undefined,
    private readonly configuredChannelId: string | undefined,
  ) {}

  isSupportStaff(member: GuildMember): boolean {
    try { if (this.permissionManager.isAdmin(member)) return true; } catch { /* ignore */ }
    if (this.supportStaffRoleId) return member.roles.cache.has(this.supportStaffRoleId);
    return false;
  }

  // ── Startup ────────────────────────────────────────────────────────────────

  async initialize(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
      try {
        await this.ensureChannel(guild);
        await this.refreshDashboard(guild);
      } catch (err) {
        logger.error(`[InboxChannel] Failed to initialize for guild ${guild.id}`, err);
      }
    }
  }

  // ── Channel resolution / auto-creation ──────────────────────────────────────

  private async ensureChannel(guild: Guild): Promise<TextChannel> {
    const overwrites = this.buildChannelOverwrites(guild);
    const existing = await getInboxChannelData(guild.id);

    if (existing?.channelId) {
      const ch = await guild.channels.fetch(existing.channelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) return ch as TextChannel;
    }

    if (this.configuredChannelId) {
      const ch = await guild.channels.fetch(this.configuredChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await ch.permissionOverwrites.set(overwrites).catch(err => logger.warning('[InboxChannel] Could not set permissions on configured channel', err));
        await setInboxChannel(guild.id, ch.id);
        return ch as TextChannel;
      }
    }

    const created = await guild.channels.create({
      name: '📥-support-inbox',
      type: ChannelType.GuildText,
      topic: 'Live Support Inbox — reply to user DMs directly from their conversation thread.',
      permissionOverwrites: overwrites,
    });
    await setInboxChannel(guild.id, created.id);
    logger.success(`[InboxChannel] Auto-created Support Inbox dashboard channel #${created.name} (${created.id})`);
    return created;
  }

  private buildChannelOverwrites(guild: Guild): OverwriteResolvable[] {
    const overwrites: OverwriteResolvable[] = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ];
    if (this.supportStaffRoleId) {
      overwrites.push({
        id: this.supportStaffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.SendMessagesInThreads,
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.ManageThreads,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }
    return overwrites;
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  private async ensureDashboardMessage(guild: Guild, channel: TextChannel): Promise<void> {
    const data = await getInboxChannelData(guild.id);
    if (data?.dashboardMessageId) {
      const msg = await channel.messages.fetch(data.dashboardMessageId).catch(() => null);
      if (msg) return;
    }
    const placeholder = await channel.send({ content: '📥 Setting up the Support Inbox dashboard…' });
    await setDashboardMessageId(guild.id, placeholder.id);
    await placeholder.pin().catch(() => {});
  }

  async refreshDashboard(guild: Guild): Promise<void> {
    try {
      const channel = await this.ensureChannel(guild);
      await this.ensureDashboardMessage(guild, channel);
      const data = await getInboxChannelData(guild.id);
      if (!data?.dashboardMessageId) return;

      const msg = await channel.messages.fetch(data.dashboardMessageId).catch(() => null);
      const all = await getAllConversations();
      const unread = getTotalUnread(all);
      const active = getActiveStaffCount();
      const payload = buildDashboard(all, unread, active);

      if (msg) {
        await msg.edit({ content: '', embeds: payload.embeds, components: payload.components });
      } else {
        const fresh = await channel.send({ embeds: payload.embeds, components: payload.components });
        await setDashboardMessageId(guild.id, fresh.id);
        await fresh.pin().catch(() => {});
      }
    } catch (err) {
      logger.warning('[InboxChannel] Dashboard refresh failed', err);
    }
  }

  /** Coalesces refresh calls (e.g. a burst of DMs) into one edit per guild every ~1.5s. */
  private scheduleRefresh(guild: Guild): void {
    if (this.refreshTimers.has(guild.id)) return;
    const timer = setTimeout(() => {
      this.refreshTimers.delete(guild.id);
      this.refreshDashboard(guild).catch(err => logger.warning('[InboxChannel] Scheduled refresh failed', err));
    }, 1500);
    this.refreshTimers.set(guild.id, timer);
  }

  // ── Thread resolution / creation ─────────────────────────────────────────────

  async ensureThread(guild: Guild, conv: InboxConversation): Promise<ThreadChannel | undefined> {
    const channel = await this.ensureChannel(guild);

    if (conv.threadId) {
      const existing = await channel.threads.fetch(conv.threadId).catch(() => null);
      if (existing) {
        if (existing.archived) await existing.setArchived(false).catch(() => {});
        if (existing.locked) await existing.setLocked(false).catch(() => {});
        return existing;
      }
    }

    const thread = await channel.threads.create({
      name: conv.userTag.slice(0, 90),
      type: ChannelType.PrivateThread,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      invitable: false,
      reason: `Support Inbox conversation with ${conv.userTag}`,
    });
    await setThreadId(conv.userId, thread.id, guild.id);

    const headerMsg = await thread.send(await this.buildHeaderPayload(guild, conv));
    await headerMsg.pin().catch(() => {});
    await setHeaderMessageId(conv.userId, headerMsg.id);

    const panel = buildThreadControlPanel(conv, getPresenceLine(conv.userId));
    const panelMsg = await thread.send({ embeds: panel.embeds, components: panel.components, content: panel.content ?? '' });
    await panelMsg.pin().catch(() => {});

    const sidebar = buildAISidebar(conv.userId);
    const sidebarMsg = await thread.send({ embeds: sidebar.embeds, components: sidebar.components });
    await sidebarMsg.pin().catch(() => {});
    await setAiSidebarMessageId(conv.userId, sidebarMsg.id);

    logger.info(`[InboxChannel] Created thread #${thread.name} for ${conv.userTag}`);
    return thread;
  }

  private async refreshThreadPanel(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    try {
      const pinned = await thread.messages.fetchPinned();
      // Header was pinned first, so it's the last item Discord returns; control panel is the middle pin.
      const sorted = [...pinned.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const panelMsg = sorted[1];
      const panel = buildThreadControlPanel(conv, getPresenceLine(conv.userId));
      if (panelMsg) await panelMsg.edit({ embeds: panel.embeds, components: panel.components, content: panel.content ?? '' });
      else { const m = await thread.send({ embeds: panel.embeds, components: panel.components, content: panel.content ?? '' }); await m.pin().catch(() => {}); }
    } catch (err) {
      logger.warning('[InboxChannel] Could not refresh thread control panel', err);
    }
  }

  // ── Conversation Header (requirement #1 + #8 badges + #10 timeline) ────────────

  private async gatherHeaderContext(guild: Guild, conv: InboxConversation) {
    const discordUser = await guild.client.users.fetch(conv.userId).catch(() => undefined);
    const member = await guild.members.fetch(conv.userId).catch(() => null);

    const mutualGuildNames: string[] = [];
    for (const [, g] of guild.client.guilds.cache) {
      const m = await g.members.fetch(conv.userId).catch(() => null);
      if (m) mutualGuildNames.push(g.name);
    }

    const [reviews, previousTickets, warnings] = await Promise.all([
      ticketSystem.reviews.getAll(guild.id).then(all => all.filter(r => r.openerId === conv.userId)).catch(() => []),
      ticketSystem.tickets.getAllForUser(guild.id, conv.userId).catch(() => []),
      getWarnings(guild.id, conv.userId).catch(() => []),
    ]);

    return { discordUser, member, mutualGuildNames, reviews, previousTickets, warnings, badge: computeBadgeStatus(conv) };
  }

  private async buildHeaderPayload(guild: Guild, conv: InboxConversation) {
    const ctx = await this.gatherHeaderContext(guild, conv);
    return buildConversationHeader({ conv, ...ctx });
  }

  /** Debounced re-render of the pinned Conversation Header — cheap fields (badge/timeline) change on
   *  nearly every message, so this is coalesced the same way the dashboard is. */
  private scheduleHeaderRefresh(guild: Guild, thread: ThreadChannel, conv: InboxConversation): void {
    if (this.headerRefreshTimers.has(thread.id)) return;
    const timer = setTimeout(() => {
      this.headerRefreshTimers.delete(thread.id);
      this.refreshThreadHeader(guild, thread, conv).catch(err => logger.warning('[InboxChannel] Header refresh failed', err));
    }, 1200);
    this.headerRefreshTimers.set(thread.id, timer);
  }

  private async refreshThreadHeader(guild: Guild, thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    try {
      const fresh = await getConversation(conv.userId);
      if (!fresh) return;
      const payload = await this.buildHeaderPayload(guild, fresh);
      const headerMsg = fresh.headerMessageId ? await thread.messages.fetch(fresh.headerMessageId).catch(() => null) : null;
      if (headerMsg) {
        await headerMsg.edit({ embeds: payload.embeds });
      } else {
        const m = await thread.send({ embeds: payload.embeds });
        await m.pin().catch(() => {});
        await setHeaderMessageId(fresh.userId, m.id);
      }
    } catch (err) {
      logger.warning('[InboxChannel] Could not refresh conversation header', err);
    }
  }

  // ── Inbound DM mirroring ─────────────────────────────────────────────────────

  async onDirectMessage(message: Message, client: Client): Promise<void> {
    if (!message.author || message.author.bot) return;

    let guild: Guild | undefined;
    for (const [, g] of client.guilds.cache) {
      const member = await g.members.fetch(message.author.id).catch(() => null);
      if (member) { guild = g; break; }
    }
    if (!guild) return;

    const conv = await getConversation(message.author.id);
    if (!conv) return; // InboxService.onDirectMessage() creates the record; if it hasn't run yet we'll catch the next message

    try {
      const isNewThread = !conv.threadId;
      const thread = await this.ensureThread(guild, conv);
      if (!thread) return;

      const payload = buildUserMessagePayload(message);
      const sent = await thread.send({ embeds: payload.embeds, files: payload.files });
      const row = buildUserMessageActionRow(conv.userId, sent.id);
      await sent.edit({ components: [row] }).catch(() => {});

      await this.maybeNotify(thread, conv, isNewThread);
      this.scheduleRefresh(guild);
      this.scheduleHeaderRefresh(guild, thread, conv);
    } catch (err) {
      logger.error(`[InboxChannel] Failed to mirror DM from ${message.author.tag}`, err);
    }
  }

  /** Smart notifications (requirement #9): ping the support role while unclaimed, or only the assigned
   *  staff member once claimed — capped to one ping per conversation every 5 minutes so a burst of DMs
   *  doesn't spam pings, except the very first message in a brand-new thread which always pings. */
  private async maybeNotify(thread: ThreadChannel, conv: InboxConversation, isNewThread: boolean): Promise<void> {
    const cooldownMs = 5 * 60 * 1000;
    const last = this.lastPingAt.get(conv.userId) ?? 0;
    if (!isNewThread && Date.now() - last < cooldownMs) return;

    if (conv.assignedTo) {
      await thread.send({
        content: `🔔 <@${conv.assignedTo}> — new message from **${conv.userTag}**.`,
        allowedMentions: { users: [conv.assignedTo] },
      }).catch(() => {});
    } else if (this.supportStaffRoleId) {
      await thread.send({
        content: `🔔 <@&${this.supportStaffRoleId}> — unclaimed conversation from **${conv.userTag}** needs a reply.`,
        allowedMentions: { roles: [this.supportStaffRoleId] },
      }).catch(() => {});
    } else {
      return;
    }
    this.lastPingAt.set(conv.userId, Date.now());
  }

  // ── Staff replies typed directly in a thread ─────────────────────────────────

  isTrackedThread(threadId: string): Promise<boolean> {
    return getConversationByThreadId(threadId).then(c => !!c);
  }

  /** Delivers reply content to the user's DM and returns the sent DM message. Throws on failure (DMs disabled, etc.) — callers catch and surface a friendly error. */
  private async deliverDM(client: Client, uid: string, content: string, fileUrls: string[] = []): Promise<Message> {
    const user = await client.users.fetch(uid);
    return user.send({ content: content || undefined, files: fileUrls.length ? fileUrls : undefined });
  }

  async handleThreadMessage(message: Message, client: Client): Promise<void> {
    if (!message.guild || message.author.bot || !message.channel.isThread()) return;
    const conv = await getConversationByThreadId(message.channel.id);
    if (!conv) return;

    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member || !this.isSupportStaff(member)) return;

    markStaffActive(message.author.id, message.author.tag);
    markViewing(conv.userId, message.author.id, message.author.tag);
    const thread = message.channel as ThreadChannel;
    const raw = message.content ?? '';

    const noteMatch = /^!note\s+([\s\S]+)/i.exec(raw.trim());
    if (noteMatch) {
      const noteText = noteMatch[1].trim();
      if (!noteText) { await message.react('❌').catch(() => {}); return; }
      await addStaffNote(conv.userId, message.author.id, message.author.tag, noteText);
      await message.react('📝').catch(() => {});
      const updated = await getConversation(conv.userId);
      if (updated) this.scheduleHeaderRefresh(message.guild, thread, updated);
      return;
    }

    if (!raw.trim() && message.attachments.size === 0) return;

    // Soft duplicate-reply warning (requirement #7): never blocks the send, just flags it.
    const otherTypers = getOtherTypers(conv.userId, message.author.id);

    let dmMsg: Message | undefined;
    try {
      dmMsg = await this.deliverDM(client, conv.userId, raw, [...message.attachments.values()].map(a => a.url));
    } catch (err) {
      logger.error(`[InboxChannel] Failed to deliver reply to ${conv.userTag}`, err);
      await message.react('❌').catch(() => {});
      await thread.send({ embeds: [buildSystemNoteEmbed(`⚠️ Could not deliver that message — **${conv.userTag}** may have DMs disabled.`, 0xed4245)] }).catch(() => {});
      return;
    }

    const wasAssignedToOther = !!conv.assignedTo && conv.assignedTo !== message.author.id;
    await addStaffReply(conv.userId, message.author.id, message.author.tag, raw, [], { msgId: message.id, dmMessageId: dmMsg.id });
    if (!conv.assignedTo) await assignTo(conv.userId, message.author.id, message.author.tag);
    if (!conv.isRead) await markAsRead(conv.userId);

    await message.react('✅').catch(() => {});
    if (wasAssignedToOther) await message.react('⚠️').catch(() => {});
    if (otherTypers.length) {
      await thread.send({ embeds: [buildSystemNoteEmbed(`⚠️ Heads up — ${otherTypers.map(t => `**${t}**`).join(', ')} also looked like ${otherTypers.length > 1 ? 'they were' : 'they were'} replying just now. Double-check for duplicate answers.`, 0xfee75c)] }).catch(() => {});
    }

    const replyTimestamp = Date.now();
    const afterReply = await getConversation(conv.userId);
    const receipt = afterReply ? this.computeReceipt(afterReply, replyTimestamp) : 'delivered';
    const bar = buildReplyActionBar(conv.userId, dmMsg.id, message.author.tag, raw || '(attachment)', receipt);
    await thread.send({ embeds: bar.embeds, components: bar.components }).catch(() => {});

    if (afterReply) {
      await this.refreshThreadPanel(thread, afterReply);
      await this.refreshThreadHeader(message.guild, thread, afterReply);
    }
    this.scheduleRefresh(message.guild);
  }

  // ── Typing bridge: staff typing in the thread → "typing…" in the user's DM ──

  async handleTypingStart(event: Typing): Promise<void> {
    if (event.user.bot || !event.channel.isThread()) return;
    const conv = await getConversationByThreadId(event.channel.id);
    if (!conv) return;
    const tag: string = event.user.tag ?? event.user.username ?? 'Unknown';
    markTyping(conv.userId, event.user.id, tag);
    markViewing(conv.userId, event.user.id, tag);
    try {
      const user = await event.channel.client.users.fetch(conv.userId);
      const dm = await user.createDM();
      await dm.sendTyping();
    } catch { /* best-effort */ }
  }

  // ── Read receipts: 👀 reaction on a mirrored user message marks it read ─────

  async handleReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<void> {
    if (user.bot) return;
    if (reaction.emoji.name !== '👀') return;
    const channel = reaction.message.channel;
    if (!channel.isThread()) return;
    const conv = await getConversationByThreadId(channel.id);
    if (!conv || conv.isRead) return;
    await markAsRead(conv.userId);
    logger.info(`[InboxChannel] ${user.tag ?? user.id} marked ${conv.userTag} as read via 👀`);
  }

  /** Read-receipt heuristic (requirement #6): "Seen" is approximated as "the user has sent any
   *  message since this reply" — Discord exposes no real read state for bot DMs. */
  private computeReceipt(conv: InboxConversation, replyTimestamp: number): RendererReceiptState {
    const seen = conv.messages.some(m => m.type === 'user' && m.timestamp > replyTimestamp);
    return seen ? 'seen' : 'delivered';
  }

  // ── ic:* interaction routing (thread control panel buttons + modals) ────────

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    try {
      if (interaction.isButton())          await this.routeButton(interaction, guild);
      else if (interaction.isModalSubmit()) await this.routeModal(interaction, guild);
    } catch (err) {
      if (isStale(err)) return;
      logger.error('[InboxChannel] Interaction error', err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }

  private async requireAccess(i: ButtonInteraction | ModalSubmitInteraction, guild: Guild): Promise<boolean> {
    const member = await guild.members.fetch(i.user.id).catch(() => null);
    if (!member || !this.isSupportStaff(member)) {
      await i.reply({ content: '❌ You do not have permission to use the Support Inbox.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return false;
    }
    markStaffActive(i.user.id, i.user.tag);
    return true;
  }

  private async routeButton(i: ButtonInteraction, guild: Guild): Promise<void> {
    const id = i.customId;

    if (id === IC.DASH_REFRESH) {
      if (!(await this.requireAccess(i, guild))) return;
      await i.deferUpdate();
      await this.refreshDashboard(guild);
      return;
    }

    const msgAction = parseMsgActionId(id);
    if (msgAction) {
      if (!(await this.requireAccess(i, guild))) return;
      markViewing(msgAction.uid, i.user.id, i.user.tag);
      await this.routeMessageAction(i, msgAction.action, msgAction.uid, msgAction.msgId);
      return;
    }

    const uid =
      id.startsWith('ic:reply:')    ? id.slice('ic:reply:'.length) :
      id.startsWith('ic:note:')     ? id.slice('ic:note:'.length) :
      id.startsWith('ic:voice:')    ? id.slice('ic:voice:'.length) :
      id.startsWith('ic:close:')    ? id.slice('ic:close:'.length) :
      id.startsWith('ic:reopen:')   ? id.slice('ic:reopen:'.length) :
      id.startsWith('ic:ai:sug:')   ? id.slice('ic:ai:sug:'.length) :
      id.startsWith('ic:ai:rw:')    ? id.slice('ic:ai:rw:'.length) :
      id.startsWith('ic:ai:tr:')    ? id.slice('ic:ai:tr:'.length) :
      id.startsWith('ic:ai:sum:')   ? id.slice('ic:ai:sum:'.length) :
      id.startsWith('ic:ai:sent:')  ? id.slice('ic:ai:sent:'.length) :
      id.startsWith('ic:ai:fu:')    ? id.slice('ic:ai:fu:'.length) :
      undefined;
    if (!uid) return;
    if (!(await this.requireAccess(i, guild))) return;
    markViewing(uid, i.user.id, i.user.tag);

    const conv = await getConversation(uid);
    if (!conv) { await i.reply({ content: '❌ Conversation not found.', flags: MessageFlags.Ephemeral }); return; }
    const thread = i.channel?.isThread() ? (i.channel as ThreadChannel) : await this.ensureThread(guild, conv);
    if (!thread) { await i.reply({ content: '❌ Could not resolve this conversation\'s thread.', flags: MessageFlags.Ephemeral }); return; }

    if (id.startsWith('ic:reply:'))   { await i.showModal(buildReplyModal(uid)); return; }
    if (id.startsWith('ic:note:'))    { await i.showModal(buildNoteModal(uid)); return; }

    if (id.startsWith('ic:ai:sug:')) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.postAIAssist(thread, conv);
      await i.editReply({ content: '✅ Posted a suggested reply in the thread.' });
      return;
    }
    if (id.startsWith('ic:ai:rw:'))   { await i.showModal(buildAIRewriteModal(uid)); return; }
    if (id.startsWith('ic:ai:tr:'))  { await i.showModal(buildAITranslateModal(uid)); return; }
    if (id.startsWith('ic:ai:sum:')) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.postSummary(thread, conv);
      await i.editReply({ content: '✅ Posted a summary in the thread.' });
      return;
    }
    if (id.startsWith('ic:ai:sent:')) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.postSentiment(thread, conv);
      await i.editReply({ content: '✅ Posted a sentiment read in the thread.' });
      return;
    }
    if (id.startsWith('ic:ai:fu:')) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.postFollowup(thread, conv);
      await i.editReply({ content: '✅ Posted a follow-up suggestion in the thread.' });
      return;
    }

    if (id.startsWith('ic:voice:')) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.createVoiceSupport(guild, thread, conv, i.member as GuildMember);
      await i.editReply({ content: '✅ Voice channel ready — details posted in the thread.' });
      return;
    }

    if (id.startsWith('ic:close:')) {
      await i.deferUpdate();
      await this.closeConversation(guild, thread, conv, i.user.tag);
      return;
    }

    if (id.startsWith('ic:reopen:')) {
      await i.deferUpdate();
      await this.reopenConversation(guild, thread, conv, i.user.tag);
      return;
    }
  }

  private async routeModal(i: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = i.customId;
    if (!(await this.requireAccess(i, guild))) return;

    if (id.startsWith('ic:reply_s:')) { await this.submitReply(i, guild, id.slice('ic:reply_s:'.length)); return; }
    if (id.startsWith('ic:note_s:'))  { await this.submitNote(i, id.slice('ic:note_s:'.length)); return; }
    if (id.startsWith('ic:ai:rw_s:')) { await this.submitAIRewrite(i, guild, id.slice('ic:ai:rw_s:'.length)); return; }
    if (id.startsWith('ic:ai:tr_s:')) { await this.submitAITranslate(i, guild, id.slice('ic:ai:tr_s:'.length)); return; }

    const msgEdit = parseMsgActionId(id);
    if (msgEdit && msgEdit.action === 'edit_s') { await this.submitMsgEdit(i, msgEdit.uid, msgEdit.msgId); return; }
  }

  private async submitReply(i: ModalSubmitInteraction, guild: Guild, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const content = i.fields.getTextInputValue('content').trim();
    if (!content) { await i.editReply({ content: '❌ Reply cannot be empty.' }); return; }

    const conv = await getConversation(uid);
    if (!conv) { await i.editReply({ content: '❌ Conversation not found.' }); return; }

    let dmMsg: Message;
    try {
      dmMsg = await this.deliverDM(i.client, uid, content);
    } catch (err) {
      logger.error(`[InboxChannel] Modal reply delivery failed for ${uid}`, err);
      await i.editReply({ content: `❌ Could not DM this user. They may have DMs disabled.` });
      return;
    }

    await addStaffReply(uid, i.user.id, i.user.tag, content, [], { msgId: `ic_reply_${Date.now()}`, dmMessageId: dmMsg.id });
    if (!conv.assignedTo) await assignTo(uid, i.user.id, i.user.tag);
    if (!conv.isRead) await markAsRead(uid);
    await i.editReply({ content: `✅ Reply sent to **${conv.userTag}**.` });

    const thread = i.channel?.isThread() ? (i.channel as ThreadChannel) : await this.ensureThread(guild, conv);
    const updated = await getConversation(uid);
    if (thread) {
      const receipt = updated ? this.computeReceipt(updated, Date.now()) : 'delivered';
      const bar = buildReplyActionBar(uid, dmMsg.id, i.user.tag, content, receipt);
      await thread.send({ embeds: bar.embeds, components: bar.components }).catch(() => {});
    }
    if (thread && updated) {
      await this.refreshThreadPanel(thread, updated);
      await this.refreshThreadHeader(guild, thread, updated);
    }
    this.scheduleRefresh(guild);
  }

  private async submitNote(i: ModalSubmitInteraction, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const content = i.fields.getTextInputValue('content').trim();
    if (!content) { await i.editReply({ content: '❌ Note cannot be empty.' }); return; }
    await addStaffNote(uid, i.user.id, i.user.tag, content);
    await i.editReply({ content: '✅ Internal note saved (not sent to the user).' });
  }

  // ── Per-message actions (requirement #4) ────────────────────────────────────

  private async findMessageByAnyId(uid: string, msgId: string): Promise<InboxMessage | undefined> {
    const conv = await getConversation(uid);
    return conv?.messages.find(m => m.id === msgId || m.dmMessageId === msgId);
  }

  private async routeMessageAction(i: ButtonInteraction, action: string, uid: string, msgId: string): Promise<void> {
    switch (action) {
      case 'pin':    await this.handleMsgPin(i, uid, msgId); return;
      case 'edit':   await this.handleMsgEdit(i, uid, msgId); return;
      case 'del':    await this.handleMsgDelete(i, uid, msgId); return;
      case 'reply':  await this.handleMsgReply(i, uid, msgId); return;
      case 'copy':   await this.handleMsgCopyId(i, msgId); return;
      case 'rw':     await this.handleMsgRewrite(i, uid, msgId); return;
      case 'rwa':    await this.handleMsgRewriteApply(i, uid, msgId); return;
      default: return;
    }
  }

  /** ⭐ Pin — pins the target message natively (the actual DM message for staff replies, so the
   *  pin shows up in the user's real Discord DM pinned list too; the mirrored thread copy for
   *  inbound user messages, since the bot doesn't own the user's original DM message). */
  private async handleMsgPin(i: ButtonInteraction, uid: string, msgId: string): Promise<void> {
    const msg = await this.findMessageByAnyId(uid, msgId);
    try {
      if (msg?.dmMessageId === msgId) {
        const user = await i.client.users.fetch(uid);
        const dm = await user.createDM();
        const dmMsg = await dm.messages.fetch(msgId).catch(() => null);
        if (dmMsg) await (dmMsg.pinned ? dmMsg.unpin() : dmMsg.pin());
      } else if (i.channel?.isThread()) {
        const tMsg = await i.channel.messages.fetch(msgId).catch(() => null);
        if (tMsg) await (tMsg.pinned ? tMsg.unpin() : tMsg.pin());
      }
      const nowPinned = await toggleMessagePinned(uid, msgId);
      await i.reply({ content: nowPinned ? '⭐ Pinned.' : '☆ Unpinned.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      logger.warning('[InboxChannel] Pin action failed', err);
      await i.reply({ content: '⚠️ Could not toggle the pin on Discord, but noted internally.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }

  private async handleMsgEdit(i: ButtonInteraction, uid: string, msgId: string): Promise<void> {
    const msg = await this.findMessageByAnyId(uid, msgId);
    if (!msg || msg.type !== 'staff_reply' || !msg.dmMessageId) {
      await i.reply({ content: '❌ Only staff replies can be edited.', flags: MessageFlags.Ephemeral });
      return;
    }
    await i.showModal(buildEditReplyModal(uid, msg.dmMessageId, msg.content));
  }

  private async submitMsgEdit(i: ModalSubmitInteraction, uid: string, dmMsgId: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const content = i.fields.getTextInputValue('content').trim();
    if (!content) { await i.editReply({ content: '❌ Message cannot be empty.' }); return; }
    try {
      const user = await i.client.users.fetch(uid);
      const dm = await user.createDM();
      const dmMsg = await dm.messages.fetch(dmMsgId);
      await dmMsg.edit({ content });
      await editStaffReplyContent(uid, dmMsgId, content);
      await i.editReply({ content: '✅ Edited — the user now sees the updated message.' });
    } catch (err) {
      logger.error('[InboxChannel] Edit reply failed', err);
      await i.editReply({ content: '❌ Could not edit that message (it may be too old, or the user has DMs disabled now).' });
    }
  }

  private async handleMsgDelete(i: ButtonInteraction, uid: string, msgId: string): Promise<void> {
    const msg = await this.findMessageByAnyId(uid, msgId);
    if (!msg || msg.type !== 'staff_reply' || !msg.dmMessageId) {
      await i.reply({ content: '❌ Only staff replies can be deleted.', flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      const user = await i.client.users.fetch(uid);
      const dm = await user.createDM();
      const dmMsg = await dm.messages.fetch(msg.dmMessageId).catch(() => null);
      if (dmMsg) await dmMsg.delete();
      await markStaffReplyDeleted(uid, msg.dmMessageId);
      await i.reply({ content: '🗑 Deleted from the user\'s DM.', flags: MessageFlags.Ephemeral });
      if (i.channel?.isThread()) {
        await i.channel.send({ embeds: [buildSystemNoteEmbed(`🗑 A reply from **${i.user.tag}** was deleted.`, 0xed4245)] }).catch(() => {});
      }
    } catch (err) {
      logger.error('[InboxChannel] Delete reply failed', err);
      await i.reply({ content: '❌ Could not delete that message.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }

  private async handleMsgReply(i: ButtonInteraction, uid: string, msgId: string): Promise<void> {
    const msg = await this.findMessageByAnyId(uid, msgId);
    await i.showModal(buildQuoteReplyModal(uid, msg?.content || '(attachment)'));
  }

  private async handleMsgCopyId(i: ButtonInteraction, msgId: string): Promise<void> {
    await i.reply({ content: `\`${msgId}\``, flags: MessageFlags.Ephemeral });
  }

  private async handleMsgRewrite(i: ButtonInteraction, uid: string, msgId: string): Promise<void> {
    const msg = await this.findMessageByAnyId(uid, msgId);
    if (!msg || !msg.dmMessageId) { await i.reply({ content: '❌ Nothing to rewrite here.', flags: MessageFlags.Ephemeral }); return; }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const ai = getGeminiClient();
    if (!ai) { await i.editReply({ content: '❌ AI Rewrite is unavailable — GEMINI_API_KEY is not set.' }); return; }
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Rewrite this support-staff reply to be clearer and more professional, keeping the same meaning and length roughly:\n\n"${msg.content}"` }] }],
      });
      const rewritten = res.text ?? msg.content;
      const preview = buildRewritePreview(uid, msg.dmMessageId, rewritten);
      await i.editReply({ embeds: preview.embeds, components: preview.components });
    } catch (err) {
      logger.error('[InboxChannel] AI Rewrite (message action) failed', err);
      await i.editReply({ content: `❌ AI error: ${err instanceof Error ? err.message : err}` });
    }
  }

  private async handleMsgRewriteApply(i: ButtonInteraction, uid: string, dmMsgId: string): Promise<void> {
    const rewritten = i.message.embeds[0]?.description;
    if (!rewritten) { await i.reply({ content: '❌ Nothing to apply.', flags: MessageFlags.Ephemeral }); return; }
    try {
      const user = await i.client.users.fetch(uid);
      const dm = await user.createDM();
      const dmMsg = await dm.messages.fetch(dmMsgId);
      await dmMsg.edit({ content: rewritten });
      await editStaffReplyContent(uid, dmMsgId, rewritten);
      await i.update({ content: '✅ Applied — the user now sees the rewritten message.', embeds: [], components: [] });
    } catch (err) {
      logger.error('[InboxChannel] AI Rewrite apply failed', err);
      await i.reply({ content: '❌ Could not apply the rewrite.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }

  // ── AI Sidebar: Assist / Rewrite / Translate / Summary / Sentiment / Follow-up ──

  private async postAIAssist(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    const ai = getGeminiClient();
    if (!ai) { await thread.send({ embeds: [buildSystemNoteEmbed('❌ AI Assist is unavailable — GEMINI_API_KEY is not set.', 0xed4245)] }); return; }
    const context = conv.messages.filter(m => m.type === 'user').slice(-5).map(m => `User: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `You are a professional support agent. Suggest a concise, helpful reply to this user's latest message. Keep it under 200 words.\n\nConversation:\n${context}\n\nSuggest a reply:` }] }],
      });
      await thread.send({ embeds: [buildAIAssistEmbed(res.text ?? 'Could not generate a suggestion.')] });
    } catch (err) {
      logger.error('[InboxChannel] AI Assist error', err);
      await thread.send({ embeds: [buildSystemNoteEmbed(`❌ AI error: ${err instanceof Error ? err.message : err}`, 0xed4245)] });
    }
  }

  private async submitAIRewrite(i: ModalSubmitInteraction, guild: Guild, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const draft = i.fields.getTextInputValue('content').trim();
    const ai = getGeminiClient();
    if (!ai) { await i.editReply({ content: '❌ AI Rewrite is unavailable — GEMINI_API_KEY is not set.' }); return; }
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Rewrite this draft support reply to be clearer, friendlier, and more professional:\n\n"${draft}"` }] }],
      });
      const thread = i.channel?.isThread() ? (i.channel as ThreadChannel) : await this.ensureThread(guild, await getConversation(uid) as InboxConversation);
      if (thread) await thread.send({ embeds: [buildAIAssistEmbed(res.text ?? 'Could not rewrite.')] });
      await i.editReply({ content: '✅ Posted the rewrite in the thread.' });
    } catch (err) {
      logger.error('[InboxChannel] AI Rewrite (sidebar) error', err);
      await i.editReply({ content: `❌ AI error: ${err instanceof Error ? err.message : err}` });
    }
  }

  private async submitAITranslate(i: ModalSubmitInteraction, guild: Guild, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const text = i.fields.getTextInputValue('content').trim();
    const language = i.fields.getTextInputValue('language')?.trim() || 'English';
    const ai = getGeminiClient();
    if (!ai) { await i.editReply({ content: '❌ AI Translate is unavailable — GEMINI_API_KEY is not set.' }); return; }
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Translate the following text to ${language}. Only output the translation:\n\n"${text}"` }] }],
      });
      const thread = i.channel?.isThread() ? (i.channel as ThreadChannel) : await this.ensureThread(guild, await getConversation(uid) as InboxConversation);
      if (thread) await thread.send({ embeds: [buildTranslateEmbed(res.text ?? 'Could not translate.', language)] });
      await i.editReply({ content: '✅ Posted the translation in the thread.' });
    } catch (err) {
      logger.error('[InboxChannel] AI Translate error', err);
      await i.editReply({ content: `❌ AI error: ${err instanceof Error ? err.message : err}` });
    }
  }

  private async postSummary(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    const ai = getGeminiClient();
    if (!ai) { await thread.send({ embeds: [buildSystemNoteEmbed('❌ Summary is unavailable — GEMINI_API_KEY is not set.', 0xed4245)] }); return; }
    const msgs = conv.messages.filter(m => m.type !== 'staff_note').slice(-20)
      .map(m => `${m.type === 'user' ? 'User' : 'Staff'}: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Summarize this support conversation in bullet points. Include: main issue, key facts, current status, any actions taken.\n\nConversation:\n${msgs}` }] }],
      });
      await thread.send({ embeds: [buildSummaryEmbed(res.text ?? 'Could not summarize.')] });
    } catch (err) {
      logger.error('[InboxChannel] Summary error', err);
      await thread.send({ embeds: [buildSystemNoteEmbed(`❌ AI error: ${err instanceof Error ? err.message : err}`, 0xed4245)] });
    }
  }

  private async postSentiment(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    const ai = getGeminiClient();
    if (!ai) { await thread.send({ embeds: [buildSystemNoteEmbed('❌ Sentiment detection is unavailable — GEMINI_API_KEY is not set.', 0xed4245)] }); return; }
    const msgs = conv.messages.filter(m => m.type === 'user').slice(-10).map(m => `User: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Analyze the sentiment of this user's messages in a support conversation. Give an overall mood (positive/neutral/frustrated/angry) and one sentence explaining why.\n\n${msgs}` }] }],
      });
      await thread.send({ embeds: [buildSentimentEmbed(res.text ?? 'Could not analyze sentiment.')] });
    } catch (err) {
      logger.error('[InboxChannel] Sentiment error', err);
      await thread.send({ embeds: [buildSystemNoteEmbed(`❌ AI error: ${err instanceof Error ? err.message : err}`, 0xed4245)] });
    }
  }

  private async postFollowup(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    const ai = getGeminiClient();
    if (!ai) { await thread.send({ embeds: [buildSystemNoteEmbed('❌ Follow-up suggestions are unavailable — GEMINI_API_KEY is not set.', 0xed4245)] }); return; }
    const msgs = conv.messages.slice(-15).map(m => `${m.type === 'user' ? 'User' : 'Staff'}: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Given this support conversation, suggest one short, proactive follow-up message staff could send to check in or move things forward.\n\n${msgs}` }] }],
      });
      await thread.send({ embeds: [buildFollowupEmbed(res.text ?? 'Could not generate a follow-up.')] });
    } catch (err) {
      logger.error('[InboxChannel] Follow-up error', err);
      await thread.send({ embeds: [buildSystemNoteEmbed(`❌ AI error: ${err instanceof Error ? err.message : err}`, 0xed4245)] });
    }
  }

  // ── Voice Support ─────────────────────────────────────────────────────────────

  private async createVoiceSupport(guild: Guild, thread: ThreadChannel, conv: InboxConversation, staff: GuildMember | null): Promise<void> {
    try {
      const parentChannel = await this.ensureChannel(guild);
      const overwrites: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ];
      if (this.supportStaffRoleId) {
        overwrites.push({ id: this.supportStaffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      }
      if (staff) overwrites.push({ id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });

      const voiceChannel = await guild.channels.create({
        name: `voice-${conv.userTag}`.slice(0, 90),
        type: ChannelType.GuildVoice,
        parent: parentChannel.parent ?? undefined,
        permissionOverwrites: overwrites,
      });

      const invite = await voiceChannel.createInvite({ maxAge: 3600, maxUses: 1, unique: true }).catch(() => null);

      if (invite) {
        try {
          const user = await guild.client.users.fetch(conv.userId);
          await user.send({ content: `🔊 A staff member would like to continue over voice. Join here: ${invite.url}\n(This link expires in 1 hour.)` });
        } catch { /* DMs may be disabled — staff still gets the link below */ }
      }

      await thread.send({
        embeds: [buildSystemNoteEmbed(
          `📞 **Voice channel ready:** ${voiceChannel}\n${invite ? `Invite sent to the user: ${invite.url}` : '⚠️ Could not generate an invite link — share the channel manually.'}`,
        )],
      });

      await addTimelineEvent(conv.userId, 'voice_session', staff?.user.tag);
      await this.refreshThreadHeader(guild, thread, (await getConversation(conv.userId)) ?? conv);

      // Best-effort cleanup; if the bot restarts before this fires the channel is simply left behind (same tradeoff other temp-channel features in this project accept).
      setTimeout(() => { voiceChannel.delete('Voice support session expired').catch(() => {}); }, 60 * 60 * 1000);
    } catch (err) {
      logger.error('[InboxChannel] Voice support setup failed', err);
      await thread.send({ embeds: [buildSystemNoteEmbed(`❌ Could not set up a voice channel: ${err instanceof Error ? err.message : err}`, 0xed4245)] });
    }
  }

  // ── Close / Reopen ────────────────────────────────────────────────────────────

  private async closeConversation(guild: Guild, thread: ThreadChannel, conv: InboxConversation, byTag: string): Promise<void> {
    await setStatus(conv.userId, 'closed');
    await thread.send({ embeds: [buildSystemNoteEmbed(`🔒 Conversation closed by **${byTag}**.`, 0xed4245)] });
    const updated = await getConversation(conv.userId);
    if (updated) {
      await this.refreshThreadPanel(thread, updated);
      await this.refreshThreadHeader(guild, thread, updated);
    }
    await thread.setLocked(true).catch(() => {});
    await thread.setArchived(true).catch(() => {});
    this.scheduleRefresh(guild);
  }

  private async reopenConversation(guild: Guild, thread: ThreadChannel, conv: InboxConversation, byTag: string): Promise<void> {
    if (thread.locked) await thread.setLocked(false).catch(() => {});
    if (thread.archived) await thread.setArchived(false).catch(() => {});
    await setStatus(conv.userId, 'open');
    await thread.send({ embeds: [buildSystemNoteEmbed(`🔓 Conversation reopened by **${byTag}**.`)] });
    const updated = await getConversation(conv.userId);
    if (updated) {
      await this.refreshThreadPanel(thread, updated);
      await this.refreshThreadHeader(guild, thread, updated);
    }
    this.scheduleRefresh(guild);
  }
}
