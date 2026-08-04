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
  AttachmentBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel,
  type ThreadChannel,
  type Interaction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
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
  markViewing,
  markTyping,
  getOtherTypers,
  getPresenceLine,
  clearThreadId,
  blockUser,
  unblockUser,
  searchConversations,
  toggleArchive,
} from '../../../community/inbox';
import type { InboxConversation, InboxMessage } from '../../../community/inbox';
import { getInboxSettings, updateInboxSettings } from './inbox-settings-store';
import { CC, isCCInteraction, parseConvPanelId, parseConvosPage } from './inbox-cc-ids';
import {
  computeCCStats,
  buildControlCenter,
  buildInboxPanel,
  buildConversationsPanel,
  buildConversationPanel,
  buildStatsPanel,
  buildSettingsPanel,
  buildStaffPanel,
  buildExportPanel,
  buildAIPanel,
  buildCleanupPanel,
  buildSearchResultsPanel,
  buildSearchModal,
  buildBroadcastModal,
  buildAnnouncementModal,
  buildConvReplyModal,
  buildConvAssignModal,
  buildConvRenameModal,
  buildSetChannelModal,
  buildSetGreetingModal,
  exportToCSV,
} from './inbox-cc-renderer';
import type { StaffMember } from './inbox-cc-renderer';
import {
  hydrateThreadCache,
  startThreadCacheCleanup,
  getCachedByUserId,
  setCached,
  removeCached,
  touchActivity,
  withPendingCreation,
  logIfSlow,
} from './thread-cache';
import { ticketSystem } from '../../../community/tickets';
import { getWarnings } from '../../../ai/tools/moderation-store';
import {
  getInboxChannelData,
  setInboxChannel,
  setDashboardMessageId,
} from './dashboard-store';
import { IC, isICInteraction, parseMsgActionId } from './ic-ids';
import {
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
  buildAIMessage,
  buildSystemMessage,
  resolveDisplayName,
  type ReceiptState as RendererReceiptState,
} from './ic-renderer';
import { getGeminiClient, AI_MODEL } from '../../../ai/gemini-client';
import { logger } from '../../../utils/logger';

const STALE = new Set([10062, 40060]);
function isStale(e: unknown): boolean {
  return !!(e && typeof e === 'object' && 'code' in e && STALE.has((e as { code: number }).code));
}

/** Discord "Unknown Channel" / "Unknown Message" — the thread (or a message in it) was deleted
 *  out-of-band. Distinct from `isStale`, which covers stale/duplicate interaction tokens. */
const CHANNEL_GONE = new Set([10003, 10008]);
function isChannelGone(e: unknown): boolean {
  return !!(e && typeof e === 'object' && 'code' in e && CHANNEL_GONE.has((e as { code: number }).code));
}

export { isICInteraction };

export class InboxChannelService {
  /** Debounce handles so a burst of DMs doesn't hammer the dashboard message with edits. */
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Debounce handles for per-thread header refreshes, keyed by thread ID. */
  private readonly headerRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Smart notification cooldown (requirement #9), keyed by conversation (= user) ID. */
  private readonly lastPingAt = new Map<string, number>();
  /** Auto-refresh interval handle. */
  private autoRefreshTimer: ReturnType<typeof setInterval> | undefined;

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
    hydrateThreadCache(await getAllConversations());
    startThreadCacheCleanup(client);
    for (const [, guild] of client.guilds.cache) {
      try {
        await this.ensureChannel(guild);
        await this.refreshDashboard(guild);
      } catch (err) {
        logger.error(`[InboxChannel] Failed to initialize for guild ${guild.id}`, err);
      }
    }
    // Auto-refresh dashboard every 30 seconds
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
    this.autoRefreshTimer = setInterval(() => {
      for (const [, guild] of client.guilds.cache) {
        this.scheduleRefresh(guild);
      }
    }, 30_000);
    this.autoRefreshTimer.unref?.();
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
    try {
      const placeholder = await channel.send({ content: '📥 Setting up the Support Inbox dashboard…' });
      await setDashboardMessageId(guild.id, placeholder.id);
      await placeholder.pin().catch(() => {});
    } catch (err) {
      logger.warning('[InboxChannel] Failed to create dashboard placeholder', err);
    }
  }

  async refreshDashboard(guild: Guild): Promise<void> {
    try {
      const channel = await this.ensureChannel(guild);
      await this.ensureDashboardMessage(guild, channel);
      const data = await getInboxChannelData(guild.id);
      if (!data?.dashboardMessageId) return;

      const msg = await channel.messages.fetch(data.dashboardMessageId).catch(() => null);
      const all = await getAllConversations();
      const stats = computeCCStats(all, getActiveStaffCount());
      const payload = buildControlCenter(stats);

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
    const lookupStart = Date.now();

    // Fast path: resolve straight from Discord.js's own in-memory channel cache. No API
    // call at all when the thread has already been seen since the bot started — this is
    // the case for essentially every message after the first one in a conversation.
    const cachedId = getCachedByUserId(conv.userId)?.threadId ?? conv.threadId;
    if (cachedId) {
      const fromCache = guild.client.channels.cache.get(cachedId);
      if (fromCache?.isThread()) {
        if (!getCachedByUserId(conv.userId)) {
          setCached({ userId: conv.userId, threadId: cachedId, guildId: guild.id, createdAt: conv.createdAt, lastActivity: Date.now() });
        }
        if (fromCache.archived) await fromCache.setArchived(false).catch(() => {});
        if (fromCache.locked) await fromCache.setLocked(false).catch(() => {});
        logIfSlow('Thread Lookup', lookupStart);
        return fromCache;
      }
    }

    // Cache miss (bot restart, or genuinely no thread yet). De-duplicate concurrent callers
    // for the same user so a burst of near-simultaneous DMs never creates two threads.
    return withPendingCreation(conv.userId, async () => {
      const channel = await this.ensureChannel(guild);

      if (conv.threadId) {
        const existing = await channel.threads.fetch(conv.threadId).catch(() => null);
        if (existing) {
          setCached({ userId: conv.userId, threadId: existing.id, guildId: guild.id, createdAt: conv.createdAt, lastActivity: Date.now() });
          if (existing.archived) await existing.setArchived(false).catch(() => {});
          if (existing.locked) await existing.setLocked(false).catch(() => {});
          logIfSlow('Thread Lookup', lookupStart);
          return existing;
        }
      }

      const createStart = Date.now();
      const thread = await channel.threads.create({
        name: conv.userTag.slice(0, 90),
        type: ChannelType.PrivateThread,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        invitable: false,
        reason: `Support Inbox conversation with ${conv.userTag}`,
      });
      await setThreadId(conv.userId, thread.id, guild.id);
      setCached({ userId: conv.userId, threadId: thread.id, guildId: guild.id, createdAt: conv.createdAt, lastActivity: Date.now() });

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

      logIfSlow('Thread Create', createStart);
      logger.info(`[InboxChannel] Created thread #${thread.name} for ${conv.userTag}`);
      return thread;
    });
  }

  /** Recreates the thread and retries once if a send fails because the thread was deleted
   *  out-of-band (Discord "Unknown Channel"/"Unknown Message" errors). Any other error is
   *  rethrown untouched so callers keep their existing error handling. */
  private async sendToThreadWithRecovery(
    guild: Guild,
    conv: InboxConversation,
    thread: ThreadChannel,
    send: (t: ThreadChannel) => Promise<Message>,
  ): Promise<{ thread: ThreadChannel; message: Message }> {
    const start = Date.now();
    try {
      const message = await send(thread);
      logIfSlow('Message Send', start);
      return { thread, message };
    } catch (err) {
      if (!isChannelGone(err)) throw err;
      logger.warning(`[InboxChannel] Thread for ${conv.userTag} is gone — recreating and retrying once.`);
      removeCached(conv.userId);
      await clearThreadId(conv.userId);
      const fresh = (await getConversation(conv.userId)) ?? { ...conv, threadId: undefined };
      const newThread = await this.ensureThread(guild, fresh);
      if (!newThread) throw err;
      const retryStart = Date.now();
      const message = await send(newThread);
      logIfSlow('Message Send', retryStart);
      return { thread: newThread, message };
    }
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
    let member: GuildMember | null = null;
    for (const [, g] of client.guilds.cache) {
      const m = await g.members.fetch(message.author.id).catch(() => null);
      if (m) { guild = g; member = m; break; }
    }
    if (!guild) return;

    const conv = await getConversation(message.author.id);
    if (!conv) return; // InboxService.onDirectMessage() creates the record; if it hasn't run yet we'll catch the next message

    try {
      const isNewThread = !conv.threadId;
      const thread = await this.ensureThread(guild, conv);
      if (!thread) return;

      const payload = buildUserMessagePayload(message, member);
      const { thread: activeThread, message: sent } = await this.sendToThreadWithRecovery(
        guild, conv, thread, t => t.send({ content: payload.content, files: payload.files }),
      );
      const row = buildUserMessageActionRow(conv.userId, sent.id);
      await sent.edit({ components: [row] }).catch(() => {});
      touchActivity(conv.userId, sent.id);

      await this.maybeNotify(activeThread, conv, isNewThread);
      this.scheduleRefresh(guild);
      this.scheduleHeaderRefresh(guild, activeThread, conv);
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

  /** Preserves the "DisplayName : " prefix on an existing outbound DM when its content is edited
   *  (via the modal edit flow or an applied AI rewrite), so the user never loses the "who's
   *  speaking" label just because the message text changed. */
  private relabelDM(existingContent: string | null | undefined, newContent: string): string {
    const prefixMatch = /^(.+?) :\s/.exec(existingContent ?? '');
    return prefixMatch ? `${prefixMatch[1]} : ${newContent}` : newContent;
  }

  /** Delivers reply content to the user's DM, prefixed with the replying staff member's display
   *  name (e.g. "Alex : Hello, how can I help?") so the user always knows who they're talking to.
   *  Returns the sent DM message. Throws on failure (DMs disabled, etc.) — callers catch and
   *  surface a friendly error. */
  private async deliverDM(client: Client, uid: string, staffName: string, content: string, fileUrls: string[] = []): Promise<Message> {
    const user = await client.users.fetch(uid);
    const prefix = staffName ? `${staffName} : ` : '';
    const maxContent = 2000 - prefix.length;
    const safe = content ? content.slice(0, maxContent) : '';
    const labeled = safe ? `${prefix}${safe}` : prefix.trimEnd() || '\u200b';
    return user.send({ content: labeled, files: fileUrls.length ? fileUrls : undefined });
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
    const staffName = resolveDisplayName(member, message.author, message.author.tag);

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
      dmMsg = await this.deliverDM(client, conv.userId, staffName, raw, [...message.attachments.values()].map(a => a.url));
    } catch (err) {
      logger.error(`[InboxChannel] Failed to deliver reply to ${conv.userTag}`, err);
      await message.react('❌').catch(() => {});
      await thread.send({ content: buildSystemMessage(`⚠️ Could not deliver that message — **${conv.userTag}** may have DMs disabled.`).content }).catch(() => {});
      return;
    }

    const wasAssignedToOther = !!conv.assignedTo && conv.assignedTo !== message.author.id;
    await addStaffReply(conv.userId, message.author.id, message.author.tag, raw, [], { msgId: message.id, dmMessageId: dmMsg.id });
    if (!conv.assignedTo) await assignTo(conv.userId, message.author.id, message.author.tag);
    if (!conv.isRead) await markAsRead(conv.userId);
    touchActivity(conv.userId, dmMsg.id);

    await message.react('✅').catch(() => {});
    if (wasAssignedToOther) await message.react('⚠️').catch(() => {});
    if (otherTypers.length) {
      await thread.send({ content: buildSystemMessage(`⚠️ Heads up — ${otherTypers.map(t => `**${t}**`).join(', ')} also looked like ${otherTypers.length > 1 ? 'they were' : 'they were'} replying just now. Double-check for duplicate answers.`).content }).catch(() => {});
    }

    const replyTimestamp = Date.now();
    const afterReply = await getConversation(conv.userId);
    const receipt = afterReply ? this.computeReceipt(afterReply, replyTimestamp) : 'delivered';
    const bar = buildReplyActionBar(conv.userId, dmMsg.id, staffName, raw || '(attachment)', receipt);
    let activeThread = thread;
    try {
      const result = await this.sendToThreadWithRecovery(message.guild, conv, thread, t => t.send({ content: bar.content, components: bar.components }));
      activeThread = result.thread;
    } catch { /* best-effort, same as before */ }

    if (afterReply) {
      await this.refreshThreadPanel(activeThread, afterReply);
      await this.refreshThreadHeader(message.guild, activeThread, afterReply);
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
      if (interaction.isButton()) {
        if (isCCInteraction(interaction.customId)) await this.routeCC(interaction, guild);
        else await this.routeButton(interaction, guild);
      } else if (interaction.isStringSelectMenu()) {
        if (isCCInteraction(interaction.customId)) await this.routeCC(interaction, guild);
      } else if (interaction.isModalSubmit()) {
        if (isCCInteraction(interaction.customId)) await this.routeCC(interaction, guild);
        else await this.routeModal(interaction, guild);
      }
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

    const staffMember = await guild.members.fetch(i.user.id).catch(() => null);
    const staffName = resolveDisplayName(staffMember, i.user, i.user.tag);

    let dmMsg: Message;
    try {
      dmMsg = await this.deliverDM(i.client, uid, staffName, content);
    } catch (err) {
      logger.error(`[InboxChannel] Modal reply delivery failed for ${uid}`, err);
      await i.editReply({ content: `❌ Could not DM this user. They may have DMs disabled.` });
      return;
    }

    await addStaffReply(uid, i.user.id, i.user.tag, content, [], { msgId: `ic_reply_${Date.now()}`, dmMessageId: dmMsg.id });
    if (!conv.assignedTo) await assignTo(uid, i.user.id, i.user.tag);
    if (!conv.isRead) await markAsRead(uid);
    await i.editReply({ content: `✅ Reply sent to **${conv.userTag}**.` });

    touchActivity(uid, dmMsg.id);
    const thread = i.channel?.isThread() ? (i.channel as ThreadChannel) : await this.ensureThread(guild, conv);
    const updated = await getConversation(uid);
    let activeThread = thread;
    if (thread) {
      const receipt = updated ? this.computeReceipt(updated, Date.now()) : 'delivered';
      const bar = buildReplyActionBar(uid, dmMsg.id, staffName, content, receipt);
      try {
        const result = await this.sendToThreadWithRecovery(guild, conv, thread, t => t.send({ content: bar.content, components: bar.components }));
        activeThread = result.thread;
      } catch { /* best-effort, same as before */ }
    }
    if (activeThread && updated) {
      await this.refreshThreadPanel(activeThread, updated);
      await this.refreshThreadHeader(guild, activeThread, updated);
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
      await dmMsg.edit({ content: this.relabelDM(dmMsg.content, content) });
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
        await i.channel.send({ content: buildSystemMessage(`🗑 A reply from **${i.user.tag}** was deleted.`).content }).catch(() => {});
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
      await dmMsg.edit({ content: this.relabelDM(dmMsg.content, rewritten) });
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
    if (!ai) { await thread.send({ content: buildSystemMessage('❌ AI Assist is unavailable — GEMINI_API_KEY is not set.').content }); return; }
    const context = conv.messages.filter(m => m.type === 'user').slice(-5).map(m => `User: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `You are a professional support agent. Suggest a concise, helpful reply to this user's latest message. Keep it under 200 words.\n\nConversation:\n${context}\n\nSuggest a reply:` }] }],
      });
      await thread.send({ content: buildAIMessage(res.text ?? 'Could not generate a suggestion.', '✨ Suggested Reply').content });
    } catch (err) {
      logger.error('[InboxChannel] AI Assist error', err);
      await thread.send({ content: buildSystemMessage(`❌ AI error: ${err instanceof Error ? err.message : err}`).content });
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
      if (thread) await thread.send({ content: buildAIMessage(res.text ?? 'Could not rewrite.', '✨ Rewrite').content });
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
      if (thread) await thread.send({ content: buildAIMessage(res.text ?? 'Could not translate.', `✨ Translation (${language})`).content });
      await i.editReply({ content: '✅ Posted the translation in the thread.' });
    } catch (err) {
      logger.error('[InboxChannel] AI Translate error', err);
      await i.editReply({ content: `❌ AI error: ${err instanceof Error ? err.message : err}` });
    }
  }

  private async postSummary(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    const ai = getGeminiClient();
    if (!ai) { await thread.send({ content: buildSystemMessage('❌ Summary is unavailable — GEMINI_API_KEY is not set.').content }); return; }
    const msgs = conv.messages.filter(m => m.type !== 'staff_note').slice(-20)
      .map(m => `${m.type === 'user' ? 'User' : 'Staff'}: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Summarize this support conversation in bullet points. Include: main issue, key facts, current status, any actions taken.\n\nConversation:\n${msgs}` }] }],
      });
      await thread.send({ content: buildAIMessage(res.text ?? 'Could not summarize.', '✨ Conversation Summary').content });
    } catch (err) {
      logger.error('[InboxChannel] Summary error', err);
      await thread.send({ content: buildSystemMessage(`❌ AI error: ${err instanceof Error ? err.message : err}`).content });
    }
  }

  private async postSentiment(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    const ai = getGeminiClient();
    if (!ai) { await thread.send({ content: buildSystemMessage('❌ Sentiment detection is unavailable — GEMINI_API_KEY is not set.').content }); return; }
    const msgs = conv.messages.filter(m => m.type === 'user').slice(-10).map(m => `User: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Analyze the sentiment of this user's messages in a support conversation. Give an overall mood (positive/neutral/frustrated/angry) and one sentence explaining why.\n\n${msgs}` }] }],
      });
      await thread.send({ content: buildAIMessage(res.text ?? 'Could not analyze sentiment.', '✨ Sentiment Detection').content });
    } catch (err) {
      logger.error('[InboxChannel] Sentiment error', err);
      await thread.send({ content: buildSystemMessage(`❌ AI error: ${err instanceof Error ? err.message : err}`).content });
    }
  }

  private async postFollowup(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    const ai = getGeminiClient();
    if (!ai) { await thread.send({ content: buildSystemMessage('❌ Follow-up suggestions are unavailable — GEMINI_API_KEY is not set.').content }); return; }
    const msgs = conv.messages.slice(-15).map(m => `${m.type === 'user' ? 'User' : 'Staff'}: ${m.content}`).join('\n');
    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Given this support conversation, suggest one short, proactive follow-up message staff could send to check in or move things forward.\n\n${msgs}` }] }],
      });
      await thread.send({ content: buildAIMessage(res.text ?? 'Could not generate a follow-up.', '✨ Suggested Follow-up').content });
    } catch (err) {
      logger.error('[InboxChannel] Follow-up error', err);
      await thread.send({ content: buildSystemMessage(`❌ AI error: ${err instanceof Error ? err.message : err}`).content });
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
      overwrites.push({
        id: conv.userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
        ],
      });
      if (staff) overwrites.push({ id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.UseVAD] });

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
        content: buildSystemMessage(
          `📞 **Voice channel ready:** ${voiceChannel}\n${invite ? `Invite sent to the user: ${invite.url}` : '⚠️ Could not generate an invite link — share the channel manually.'}`,
        ).content,
      });

      await addTimelineEvent(conv.userId, 'voice_session', staff?.user.tag);
      await this.refreshThreadHeader(guild, thread, (await getConversation(conv.userId)) ?? conv);

      // Best-effort cleanup; if the bot restarts before this fires the channel is simply left behind (same tradeoff other temp-channel features in this project accept).
      setTimeout(() => { voiceChannel.delete('Voice support session expired').catch(() => {}); }, 60 * 60 * 1000);
    } catch (err) {
      logger.error('[InboxChannel] Voice support setup failed', err);
      await thread.send({ content: buildSystemMessage(`❌ Could not set up a voice channel: ${err instanceof Error ? err.message : err}`).content });
    }
  }

  // ── Close / Reopen ────────────────────────────────────────────────────────────

  private async closeConversation(guild: Guild, thread: ThreadChannel, conv: InboxConversation, byTag: string): Promise<void> {
    await setStatus(conv.userId, 'closed');
    await thread.send({ content: buildSystemMessage(`🔒 Conversation closed by **${byTag}**.`).content });
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
    await thread.send({ content: buildSystemMessage(`🔓 Conversation reopened by **${byTag}**.`).content });
    const updated = await getConversation(conv.userId);
    if (updated) {
      await this.refreshThreadPanel(thread, updated);
      await this.refreshThreadHeader(guild, thread, updated);
    }
    this.scheduleRefresh(guild);
  }

  // ── Control Center routing (ic:cc:*) ─────────────────────────────────────────

  async routeCC(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
    guild: Guild,
  ): Promise<void> {
    const id = interaction.customId;

    // ── Conversation select menu (ic:cc:select) ──
    if (id === CC.CONVOS_SELECT && interaction.isStringSelectMenu()) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      const uid = interaction.values[0];
      if (!uid) { await interaction.reply({ content: '❌ No conversation selected.', flags: MessageFlags.Ephemeral }); return; }
      await this.ccShowConv(interaction as unknown as ButtonInteraction, guild, uid);
      return;
    }

    // ── Navigation buttons ──
    if (id === CC.INBOX) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const all = await getAllConversations();
      const payload = buildInboxPanel(all);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id.startsWith('ic:cc:convos')) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const page = parseConvosPage(id);
      const all = await getAllConversations();
      const payload = buildConversationsPanel(all, page);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components as never });
      return;
    }

    if (id === CC.STATS_DAY || id === CC.STATS_WEEK || id === CC.STATS_MONTH) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      const period = id === CC.STATS_WEEK ? 'week' : id === CC.STATS_MONTH ? 'month' : 'day';
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const all = await getAllConversations();
      const payload = buildStatsPanel(all, period as 'day' | 'week' | 'month');
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.SETTINGS) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const settings = await getInboxSettings(guild.id);
      const payload = buildSettingsPanel(settings);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.SEARCH) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await (interaction as ButtonInteraction).showModal(buildSearchModal());
      return;
    }

    if (id === CC.BROADCAST) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await (interaction as ButtonInteraction).showModal(buildBroadcastModal());
      return;
    }

    if (id === CC.ANNOUNCE) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await (interaction as ButtonInteraction).showModal(buildAnnouncementModal());
      return;
    }

    if (id === CC.STAFF) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const all = await getAllConversations();
      // Build staff member list from active staff tags (approximated presence)
      const { getActiveStaffTags } = await import('../../../community/inbox/staff-activity');
      const activeTags = getActiveStaffTags();
      const staffMembers: StaffMember[] = activeTags.map(tag => ({ id: tag, tag, lastActive: Date.now() }));
      const payload = buildStaffPanel(staffMembers, all);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.AI_PANEL) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const payload = buildAIPanel();
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.EXPORT) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const all = await getAllConversations();
      const payload = buildExportPanel(all.length);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.EXPORT_CSV || id === CC.EXPORT_JSON || id === CC.EXPORT_TODAY) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let all = await getAllConversations();
      if (id === CC.EXPORT_TODAY) {
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        all = all.filter(c => c.lastMessageAt >= dayStart.getTime());
      }
      if (id === CC.EXPORT_JSON) {
        const json = JSON.stringify(all, null, 2);
        const file = new AttachmentBuilder(Buffer.from(json, 'utf-8'), { name: 'inbox-export.json' });
        await interaction.editReply({ content: `✅ Exported ${all.length} conversation(s) as JSON.`, files: [file] });
      } else {
        const csv = exportToCSV(all);
        const file = new AttachmentBuilder(Buffer.from(csv, 'utf-8'), { name: 'inbox-export.csv' });
        await interaction.editReply({ content: `✅ Exported ${all.length} conversation(s) as CSV.`, files: [file] });
      }
      return;
    }

    if (id === CC.CLEANUP) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const all = await getAllConversations();
      const payload = buildCleanupPanel(all);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.CLEANUP_CONFIRM) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const all = await getAllConversations();
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const stale = all.filter(c => c.status === 'closed' && c.updatedAt < thirtyDaysAgo);
      for (const conv of stale) await toggleArchive(conv.userId);
      await interaction.editReply({ content: `✅ Archived **${stale.length}** stale conversation(s).` });
      this.scheduleRefresh(guild);
      return;
    }

    // ── Conversation management panel (ic:cc:c:<uid>) ──
    const convPanelUid = parseConvPanelId(id);
    if (convPanelUid) {
      if (!(await this.requireAccess(interaction as unknown as ButtonInteraction, guild))) return;
      await this.ccShowConv(interaction as unknown as ButtonInteraction, guild, convPanelUid);
      return;
    }

    // ── Conversation actions ──
    if (id.startsWith('ic:cc:cr:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:cr:'.length);
      const conv = await getConversation(uid);
      if (!conv) { await interaction.reply({ content: '❌ Conversation not found.', flags: MessageFlags.Ephemeral }); return; }
      await interaction.showModal(buildConvReplyModal(uid));
      return;
    }

    if (id.startsWith('ic:cc:ca:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:ca:'.length);
      const conv = await getConversation(uid);
      if (!conv) { await interaction.reply({ content: '❌ Conversation not found.', flags: MessageFlags.Ephemeral }); return; }
      await interaction.showModal(buildConvAssignModal(uid, conv.userTag, 'assign'));
      return;
    }

    if (id.startsWith('ic:cc:ct:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:ct:'.length);
      const conv = await getConversation(uid);
      if (!conv) { await interaction.reply({ content: '❌ Conversation not found.', flags: MessageFlags.Ephemeral }); return; }
      await interaction.showModal(buildConvAssignModal(uid, conv.userTag, 'transfer'));
      return;
    }

    if (id.startsWith('ic:cc:cn:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:cn:'.length);
      const conv = await getConversation(uid);
      if (!conv || !conv.threadId) { await interaction.reply({ content: '❌ No thread found for this conversation.', flags: MessageFlags.Ephemeral }); return; }
      await interaction.showModal(buildConvRenameModal(uid, conv.userTag));
      return;
    }

    if (id.startsWith('ic:cc:cl:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:cl:'.length);
      await this.ccToggleClose(interaction as ButtonInteraction, guild, uid);
      return;
    }

    if (id.startsWith('ic:cc:cb:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:cb:'.length);
      await this.ccBlockUser(interaction as ButtonInteraction, guild, uid, true);
      return;
    }

    if (id.startsWith('ic:cc:cub:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:cub:'.length);
      await this.ccBlockUser(interaction as ButtonInteraction, guild, uid, false);
      return;
    }

    if (id.startsWith('ic:cc:cdt:') && interaction.isButton()) {
      const uid = id.slice('ic:cc:cdt:'.length);
      await this.ccDeleteThread(interaction as ButtonInteraction, guild, uid);
      return;
    }

    // ── Settings actions ──
    if (id === CC.SET_CHANNEL && interaction.isButton())  { await interaction.showModal(buildSetChannelModal((await getInboxSettings(guild.id)).supportChannelId, 'support')); return; }
    if (id === CC.SET_LOGCHAN && interaction.isButton())  { await interaction.showModal(buildSetChannelModal((await getInboxSettings(guild.id)).logChannelId, 'log')); return; }
    if (id === CC.SET_GREETING && interaction.isButton()) { await interaction.showModal(buildSetGreetingModal((await getInboxSettings(guild.id)).greetingMessage)); return; }

    if (id === CC.SET_AUTOTHREAD && interaction.isButton()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const s = await getInboxSettings(guild.id);
      const updated = await updateInboxSettings(guild.id, { autoThread: !s.autoThread });
      const payload = buildSettingsPanel(updated);
      await interaction.editReply({ content: `✅ Auto-Thread is now **${updated.autoThread ? 'enabled' : 'disabled'}**.`, embeds: payload.embeds, components: payload.components });
      return;
    }
    if (id === CC.SET_AUTOARCHIVE && interaction.isButton()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const s = await getInboxSettings(guild.id);
      const updated = await updateInboxSettings(guild.id, { autoArchiveDays: s.autoArchiveDays > 0 ? 0 : 7 });
      const payload = buildSettingsPanel(updated);
      await interaction.editReply({ content: `✅ Auto-Archive is now **${updated.autoArchiveDays > 0 ? `enabled (${updated.autoArchiveDays}d)` : 'disabled'}**.`, embeds: payload.embeds, components: payload.components });
      return;
    }
    if (id === CC.SET_AUTOCLOSE && interaction.isButton()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const s = await getInboxSettings(guild.id);
      const updated = await updateInboxSettings(guild.id, { autoCloseDays: s.autoCloseDays > 0 ? 0 : 30 });
      const payload = buildSettingsPanel(updated);
      await interaction.editReply({ content: `✅ Auto-Close is now **${updated.autoCloseDays > 0 ? `enabled (${updated.autoCloseDays}d)` : 'disabled'}**.`, embeds: payload.embeds, components: payload.components });
      return;
    }
    if (id === CC.SET_AI && interaction.isButton()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const s = await getInboxSettings(guild.id);
      const updated = await updateInboxSettings(guild.id, { aiEnabled: !s.aiEnabled });
      const payload = buildSettingsPanel(updated);
      await interaction.editReply({ content: `✅ AI Features are now **${updated.aiEnabled ? 'enabled' : 'disabled'}**.`, embeds: payload.embeds, components: payload.components });
      return;
    }

    // ── Modal submits ──
    if (id === CC.SEARCH_SUBMIT && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const query = interaction.fields.getTextInputValue('query').trim();
      const all = await getAllConversations();
      const results = searchConversations(all, query);
      const payload = buildSearchResultsPanel(query, results);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components as never });
      return;
    }

    if (id === CC.BROADCAST_SUBMIT && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const message = interaction.fields.getTextInputValue('message').trim();
      const all = await getAllConversations();
      const open = all.filter(c => c.status === 'open' && !c.isArchived && !(c as InboxConversation & { isBlocked?: boolean }).isBlocked);
      let sent = 0; let failed = 0;
      for (const conv of open) {
        try {
          const user = await interaction.client.users.fetch(conv.userId);
          await user.send({ content: message });
          sent++;
        } catch { failed++; }
      }
      await interaction.editReply({ content: `📝 Broadcast complete — sent to **${sent}** user(s)${failed ? `, failed for **${failed}**` : ''}.` });
      return;
    }

    if (id === CC.ANNOUNCE_SUBMIT && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const title   = interaction.fields.getTextInputValue('title').trim();
      const message = interaction.fields.getTextInputValue('message').trim();
      const all = await getAllConversations();
      const open = all.filter(c => c.status === 'open' && !c.isArchived && !(c as InboxConversation & { isBlocked?: boolean }).isBlocked);
      let sent = 0; let failed = 0;
      for (const conv of open) {
        try {
          const user = await interaction.client.users.fetch(conv.userId);
          await user.send({ content: `📢 **${title}**\n\n${message}` });
          sent++;
        } catch { failed++; }
      }
      await interaction.editReply({ content: `📢 Announcement sent to **${sent}** user(s)${failed ? `, failed for **${failed}**` : ''}.` });
      return;
    }

    if (id.startsWith('ic:cc:cr_s:') && interaction.isModalSubmit()) {
      const uid = id.slice('ic:cc:cr_s:'.length);
      await this.ccSubmitReply(interaction, guild, uid);
      return;
    }

    if (id.startsWith('ic:cc:ca_s:') && interaction.isModalSubmit()) {
      const uid = id.slice('ic:cc:ca_s:'.length);
      await this.ccSubmitAssign(interaction, guild, uid, 'assign');
      return;
    }

    if (id.startsWith('ic:cc:ct_s:') && interaction.isModalSubmit()) {
      const uid = id.slice('ic:cc:ct_s:'.length);
      await this.ccSubmitAssign(interaction, guild, uid, 'transfer');
      return;
    }

    if (id.startsWith('ic:cc:cn_s:') && interaction.isModalSubmit()) {
      const uid = id.slice('ic:cc:cn_s:'.length);
      await this.ccSubmitRename(interaction, guild, uid);
      return;
    }

    if (id === CC.SET_CHANNEL_SUBMIT && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channelId = interaction.fields.getTextInputValue('channel_id').trim() || undefined;
      const updated = await updateInboxSettings(guild.id, { supportChannelId: channelId });
      const payload = buildSettingsPanel(updated);
      await interaction.editReply({ content: `✅ Support channel ${channelId ? `set to <#${channelId}>` : 'cleared (auto-created)'}.`, embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.SET_LOGCHAN_SUBMIT && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channelId = interaction.fields.getTextInputValue('channel_id').trim() || undefined;
      const updated = await updateInboxSettings(guild.id, { logChannelId: channelId });
      const payload = buildSettingsPanel(updated);
      await interaction.editReply({ content: `✅ Log channel ${channelId ? `set to <#${channelId}>` : 'cleared'}.`, embeds: payload.embeds, components: payload.components });
      return;
    }

    if (id === CC.SET_GREETING_SUBMIT && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const greeting = interaction.fields.getTextInputValue('greeting').trim();
      const updated = await updateInboxSettings(guild.id, { greetingMessage: greeting });
      const payload = buildSettingsPanel(updated);
      await interaction.editReply({ content: '✅ Greeting message updated.', embeds: payload.embeds, components: payload.components });
      return;
    }
  }

  // ── CC action helpers ─────────────────────────────────────────────────────────

  private async ccShowConv(
    interaction: ButtonInteraction,
    _guild: Guild,
    uid: string,
  ): Promise<void> {
    const isDeferred = interaction.deferred || interaction.replied;
    if (!isDeferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const conv = await getConversation(uid);
    if (!conv) { await interaction.editReply({ content: '❌ Conversation not found.' }); return; }
    const payload = buildConversationPanel(conv);
    await interaction.editReply({ embeds: payload.embeds, components: payload.components });
  }

  private async ccToggleClose(
    interaction: ButtonInteraction,
    guild: Guild,
    uid: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const conv = await getConversation(uid);
    if (!conv) { await interaction.editReply({ content: '❌ Conversation not found.' }); return; }
    const newStatus = conv.status === 'open' ? 'closed' : 'open';
    await setStatus(uid, newStatus);
    if (conv.threadId) {
      const thread = await guild.channels.fetch(conv.threadId).catch(() => null) as ThreadChannel | null;
      if (thread?.isThread()) {
        if (newStatus === 'closed') {
          await thread.send({ content: buildSystemMessage(`🔒 Conversation closed by **${interaction.user.tag}** via Control Center.`).content });
          await thread.setLocked(true).catch(() => {});
          await thread.setArchived(true).catch(() => {});
        } else {
          if (thread.locked)   await thread.setLocked(false).catch(() => {});
          if (thread.archived) await thread.setArchived(false).catch(() => {});
          await thread.send({ content: buildSystemMessage(`🔓 Conversation reopened by **${interaction.user.tag}** via Control Center.`).content });
        }
        const updated = await getConversation(uid);
        if (updated) { await this.refreshThreadPanel(thread, updated); }
      }
    }
    const updated = await getConversation(uid);
    const payload = updated ? buildConversationPanel(updated) : undefined;
    await interaction.editReply({
      content: `✅ Conversation ${newStatus === 'closed' ? 'closed' : 'reopened'}.`,
      ...(payload ? { embeds: payload.embeds, components: payload.components } : {}),
    });
    this.scheduleRefresh(guild);
  }

  private async ccBlockUser(
    interaction: ButtonInteraction,
    guild: Guild,
    uid: string,
    block: boolean,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const conv = await getConversation(uid);
    if (!conv) { await interaction.editReply({ content: '❌ Conversation not found.' }); return; }
    if (block) await blockUser(uid); else await unblockUser(uid);
    if (conv.threadId) {
      const thread = await guild.channels.fetch(conv.threadId).catch(() => null) as ThreadChannel | null;
      if (thread?.isThread()) {
        await thread.send({ content: buildSystemMessage(`${block ? '🚫 User blocked' : '✅ User unblocked'} by **${interaction.user.tag}** via Control Center.`).content }).catch(() => {});
      }
    }
    const updated = await getConversation(uid);
    const payload = updated ? buildConversationPanel(updated) : undefined;
    await interaction.editReply({
      content: `${block ? '🚫 User blocked' : '✅ User unblocked'}. They ${block ? 'will not receive' : 'can now receive'} replies.`,
      ...(payload ? { embeds: payload.embeds, components: payload.components } : {}),
    });
  }

  private async ccDeleteThread(
    interaction: ButtonInteraction,
    guild: Guild,
    uid: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const conv = await getConversation(uid);
    if (!conv?.threadId) { await interaction.editReply({ content: '❌ No thread to delete.' }); return; }
    const thread = await guild.channels.fetch(conv.threadId).catch(() => null) as ThreadChannel | null;
    if (thread?.isThread()) {
      await thread.delete('Deleted via Support Inbox Control Center').catch(() => {});
    }
    await clearThreadId(uid);
    removeCached(uid);
    await interaction.editReply({ content: '🗑️ Thread deleted and conversation unlinked. A new thread will be created on the next DM.' });
    this.scheduleRefresh(guild);
  }

  private async ccSubmitReply(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    uid: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const content = interaction.fields.getTextInputValue('content').trim();
    if (!content) { await interaction.editReply({ content: '❌ Reply cannot be empty.' }); return; }
    const conv = await getConversation(uid);
    if (!conv) { await interaction.editReply({ content: '❌ Conversation not found.' }); return; }
    if ((conv as InboxConversation & { isBlocked?: boolean }).isBlocked) {
      await interaction.editReply({ content: '🚫 This user is blocked — unblock them first before sending a reply.' }); return;
    }
    const staffMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    const staffName = resolveDisplayName(staffMember, interaction.user, interaction.user.tag);
    try {
      const dmMsg = await this.deliverDM(interaction.client, uid, staffName, content);
      await addStaffReply(uid, interaction.user.id, interaction.user.tag, content, [], { msgId: `cc_reply_${Date.now()}`, dmMessageId: dmMsg.id });
      if (!conv.assignedTo) await assignTo(uid, interaction.user.id, interaction.user.tag);
      if (!conv.isRead) await markAsRead(uid);
      if (conv.threadId) {
        const thread = await guild.channels.fetch(conv.threadId).catch(() => null) as ThreadChannel | null;
        if (thread?.isThread()) {
          const receipt = 'delivered';
          const bar = buildReplyActionBar(uid, dmMsg.id, staffName, content, receipt);
          await thread.send({ content: bar.content, components: bar.components }).catch(() => {});
        }
      }
      await interaction.editReply({ content: `✅ Reply sent to **${conv.userTag}**.` });
      this.scheduleRefresh(guild);
    } catch (err) {
      logger.error(`[InboxCC] Reply delivery failed for ${uid}`, err);
      await interaction.editReply({ content: '❌ Could not DM this user — they may have DMs disabled.' });
    }
  }

  private async ccSubmitAssign(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    uid: string,
    mode: 'assign' | 'transfer',
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const staffId  = interaction.fields.getTextInputValue('staff_id').trim() || undefined;
    const staffTag = interaction.fields.getTextInputValue('staff_tag').trim() || staffId;
    await assignTo(uid, staffId, staffTag);
    const conv = await getConversation(uid);
    if (conv?.threadId) {
      const thread = await guild.channels.fetch(conv.threadId).catch(() => null) as ThreadChannel | null;
      if (thread?.isThread()) {
        const who = staffId ? (staffTag ?? staffId) : 'nobody (unassigned)';
        await thread.send({ content: buildSystemMessage(`${mode === 'transfer' ? '🔁 Transferred' : '👤 Assigned'} to **${who}** by **${interaction.user.tag}** via Control Center.`).content }).catch(() => {});
        const updated = await getConversation(uid);
        if (updated) await this.refreshThreadPanel(thread, updated);
      }
    }
    const updated = await getConversation(uid);
    const payload = updated ? buildConversationPanel(updated) : undefined;
    await interaction.editReply({
      content: staffId ? `✅ ${mode === 'transfer' ? 'Transferred' : 'Assigned'} to **${staffTag ?? staffId}**.` : '✅ Conversation unassigned.',
      ...(payload ? { embeds: payload.embeds, components: payload.components } : {}),
    });
    this.scheduleRefresh(guild);
  }

  private async ccSubmitRename(
    interaction: ModalSubmitInteraction,
    _guild: Guild,
    uid: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name = interaction.fields.getTextInputValue('name').trim().slice(0, 90);
    if (!name) { await interaction.editReply({ content: '❌ Thread name cannot be empty.' }); return; }
    const conv = await getConversation(uid);
    if (!conv?.threadId) { await interaction.editReply({ content: '❌ No thread found for this conversation.' }); return; }
    const thread = await _guild.channels.fetch(conv.threadId).catch(() => null) as ThreadChannel | null;
    if (!thread?.isThread()) { await interaction.editReply({ content: '❌ Could not find the thread on Discord.' }); return; }
    await thread.setName(name).catch(() => {});
    await interaction.editReply({ content: `✅ Thread renamed to **${name}**.` });
  }
}
