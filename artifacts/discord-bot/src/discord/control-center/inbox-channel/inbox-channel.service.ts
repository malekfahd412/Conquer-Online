// ─────────────────────────────────────────────────────────────────────────────
// Discord-Native Support Inbox — Channel + Thread Service
//
// Adds a Discord-native "DM inbox" experience on top of the existing Support
// Inbox Pro backend (community/inbox/*) and its ephemeral /panel UI (both left
// fully intact — this is a second, additive interface onto the same data):
//
//   • A dashboard channel showing active conversations, unread count, and a
//     "staff active now" count, auto-created and remembered if not configured.
//   • One private thread per user conversation. Inbound DMs are mirrored into
//     the thread as clean embeds; staff simply type in the thread and their
//     plain messages are forwarded straight to the user's DM — no modal
//     needed. A pinned control panel offers Reply / Internal Note / AI
//     Assist / Voice Support / Summary / Close as structured actions.
//
// Design notes:
//   - Threads are created as PrivateThread. Anyone with `ManageThreads` on the
//     parent channel automatically sees every private thread in it, so the
//     support-staff role is granted `ManageThreads` on the dashboard channel
//     instead of inviting each staff member to each thread individually.
//   - "Staff Active Now" approximates presence via staff-activity.ts rather
//     than the privileged Presence Intent, so this never risks breaking the
//     bot's login if that intent isn't separately approved in the Discord
//     Developer Portal.
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
  markAsRead,
  assignTo,
  setStatus,
  setThreadId,
  markStaffActive,
  getActiveStaffCount,
  getTotalUnread,
} from '../../../community/inbox';
import type { InboxConversation } from '../../../community/inbox';
import {
  getInboxChannelData,
  setInboxChannel,
  setDashboardMessageId,
} from './dashboard-store';
import { IC, isICInteraction } from './ic-ids';
import {
  buildDashboard,
  buildThreadControlPanel,
  buildUserMessageEmbeds,
  buildReplyModal,
  buildNoteModal,
  buildAIAssistEmbed,
  buildSummaryEmbed,
  buildSystemNoteEmbed,
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

    const panel = buildThreadControlPanel(conv);
    const panelMsg = await thread.send({ embeds: panel.embeds, components: panel.components });
    await panelMsg.pin().catch(() => {});

    logger.info(`[InboxChannel] Created thread #${thread.name} for ${conv.userTag}`);
    return thread;
  }

  private async refreshThreadPanel(thread: ThreadChannel, conv: InboxConversation): Promise<void> {
    try {
      const pinned = await thread.messages.fetchPinned();
      const panelMsg = pinned.first();
      const panel = buildThreadControlPanel(conv);
      if (panelMsg) await panelMsg.edit({ embeds: panel.embeds, components: panel.components });
      else { const m = await thread.send({ embeds: panel.embeds, components: panel.components }); await m.pin().catch(() => {}); }
    } catch (err) {
      logger.warning('[InboxChannel] Could not refresh thread control panel', err);
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
      const thread = await this.ensureThread(guild, conv);
      if (!thread) return;
      const embeds = buildUserMessageEmbeds(message);
      await thread.send({ embeds });
      this.scheduleRefresh(guild);
    } catch (err) {
      logger.error(`[InboxChannel] Failed to mirror DM from ${message.author.tag}`, err);
    }
  }

  // ── Staff replies typed directly in a thread ─────────────────────────────────

  isTrackedThread(threadId: string): Promise<boolean> {
    return getConversationByThreadId(threadId).then(c => !!c);
  }

  async handleThreadMessage(message: Message, client: Client): Promise<void> {
    if (!message.guild || message.author.bot || !message.channel.isThread()) return;
    const conv = await getConversationByThreadId(message.channel.id);
    if (!conv) return;

    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member || !this.isSupportStaff(member)) return;

    markStaffActive(message.author.id, message.author.tag);
    const thread = message.channel as ThreadChannel;
    const raw = message.content ?? '';

    const noteMatch = /^!note\s+([\s\S]+)/i.exec(raw.trim());
    if (noteMatch) {
      const noteText = noteMatch[1].trim();
      if (!noteText) { await message.react('❌').catch(() => {}); return; }
      await addStaffNote(conv.userId, message.author.id, message.author.tag, noteText);
      await message.react('📝').catch(() => {});
      return;
    }

    if (!raw.trim() && message.attachments.size === 0) return;

    try {
      const user = await client.users.fetch(conv.userId);
      await user.send({
        content: raw || undefined,
        files: [...message.attachments.values()].map(a => a.url),
      });
    } catch (err) {
      logger.error(`[InboxChannel] Failed to deliver reply to ${conv.userTag}`, err);
      await message.react('❌').catch(() => {});
      await thread.send({ embeds: [buildSystemNoteEmbed(`⚠️ Could not deliver that message — **${conv.userTag}** may have DMs disabled.`, 0xed4245)] }).catch(() => {});
      return;
    }

    const wasAssignedToOther = !!conv.assignedTo && conv.assignedTo !== message.author.id;
    await addStaffReply(conv.userId, message.author.id, message.author.tag, raw, [], { msgId: message.id });
    if (!conv.assignedTo) await assignTo(conv.userId, message.author.id, message.author.tag);
    if (!conv.isRead) await markAsRead(conv.userId);

    await message.react('✅').catch(() => {});
    if (wasAssignedToOther) await message.react('⚠️').catch(() => {});

    const updated = await getConversation(conv.userId);
    if (updated) await this.refreshThreadPanel(thread, updated);
    this.scheduleRefresh(message.guild);
  }

  // ── Typing bridge: staff typing in the thread → "typing…" in the user's DM ──

  async handleTypingStart(event: Typing): Promise<void> {
    if (event.user.bot || !event.channel.isThread()) return;
    const conv = await getConversationByThreadId(event.channel.id);
    if (!conv) return;
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

    const uid =
      id.startsWith('ic:reply:')   ? id.slice('ic:reply:'.length) :
      id.startsWith('ic:note:')    ? id.slice('ic:note:'.length) :
      id.startsWith('ic:ai:')      ? id.slice('ic:ai:'.length) :
      id.startsWith('ic:voice:')   ? id.slice('ic:voice:'.length) :
      id.startsWith('ic:summary:') ? id.slice('ic:summary:'.length) :
      id.startsWith('ic:close:')   ? id.slice('ic:close:'.length) :
      id.startsWith('ic:reopen:')  ? id.slice('ic:reopen:'.length) :
      undefined;
    if (!uid) return;
    if (!(await this.requireAccess(i, guild))) return;

    const conv = await getConversation(uid);
    if (!conv) { await i.reply({ content: '❌ Conversation not found.', flags: MessageFlags.Ephemeral }); return; }
    const thread = i.channel?.isThread() ? (i.channel as ThreadChannel) : await this.ensureThread(guild, conv);
    if (!thread) { await i.reply({ content: '❌ Could not resolve this conversation\'s thread.', flags: MessageFlags.Ephemeral }); return; }

    if (id.startsWith('ic:reply:'))   { await i.showModal(buildReplyModal(uid)); return; }
    if (id.startsWith('ic:note:'))    { await i.showModal(buildNoteModal(uid)); return; }

    if (id.startsWith('ic:ai:')) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.postAIAssist(thread, conv);
      await i.editReply({ content: '✅ Posted a suggested reply in the thread.' });
      return;
    }

    if (id.startsWith('ic:summary:')) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.postSummary(thread, conv);
      await i.editReply({ content: '✅ Posted a summary in the thread.' });
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

    if (id.startsWith('ic:reply_s:')) {
      const uid = id.slice('ic:reply_s:'.length);
      await this.submitReply(i, guild, uid);
      return;
    }
    if (id.startsWith('ic:note_s:')) {
      const uid = id.slice('ic:note_s:'.length);
      await this.submitNote(i, uid);
      return;
    }
  }

  private async submitReply(i: ModalSubmitInteraction, guild: Guild, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const content = i.fields.getTextInputValue('content').trim();
    if (!content) { await i.editReply({ content: '❌ Reply cannot be empty.' }); return; }

    const conv = await getConversation(uid);
    if (!conv) { await i.editReply({ content: '❌ Conversation not found.' }); return; }

    try {
      const user = await i.client.users.fetch(uid);
      await user.send({ content });
    } catch (err) {
      logger.error(`[InboxChannel] Modal reply delivery failed for ${uid}`, err);
      await i.editReply({ content: `❌ Could not DM this user. They may have DMs disabled.` });
      return;
    }

    const msgId = `ic_reply_${Date.now()}`;
    await addStaffReply(uid, i.user.id, i.user.tag, content, [], { msgId });
    if (!conv.assignedTo) await assignTo(uid, i.user.id, i.user.tag);
    if (!conv.isRead) await markAsRead(uid);
    await i.editReply({ content: `✅ Reply sent to **${conv.userTag}**.` });

    const thread = i.channel?.isThread() ? (i.channel as ThreadChannel) : await this.ensureThread(guild, conv);
    const updated = await getConversation(uid);
    if (thread && updated) await this.refreshThreadPanel(thread, updated);
    this.scheduleRefresh(guild);
  }

  private async submitNote(i: ModalSubmitInteraction, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const content = i.fields.getTextInputValue('content').trim();
    if (!content) { await i.editReply({ content: '❌ Note cannot be empty.' }); return; }
    await addStaffNote(uid, i.user.id, i.user.tag, content);
    await i.editReply({ content: '✅ Internal note saved (not sent to the user).' });
  }

  // ── AI Assist / Summary ──────────────────────────────────────────────────────

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
    if (updated) await this.refreshThreadPanel(thread, updated);
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
    if (updated) await this.refreshThreadPanel(thread, updated);
    this.scheduleRefresh(guild);
  }
}
