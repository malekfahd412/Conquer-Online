// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Main Service
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  MessageFlags,
  type Client,
  type Message,
  type Guild,
  type GuildMember,
  type Interaction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { PermissionManager } from '../../../ai/permission-manager';
import {
  getAllConversations,
  getConversation,
  addUserMessage,
  addStaffReply,
  addStaffNote,
  markAsRead,
  markAsUnread,
  togglePin,
  toggleArchive,
  setStatus,
  assignTo,
  addTag,
  searchConversations,
  sortConversations,
  filterConversations,
  getTotalUnread,
  updateUserAvatar,
} from '../../../community/inbox';
import type { InboxSortMode, InboxFilterMode } from '../../../community/inbox';
import { SI, isSIInteraction } from './inbox-ids';
import {
  buildInboxList,
  buildConversationView,
  buildSearchResults,
  buildAIResult,
  buildReplyModal,
  buildNoteModal,
  buildTagModal,
  buildSearchModal,
  buildRewriteModal,
  buildDMComposerModal,
  buildInfoEmbed,
} from './inbox-renderer';
import { getGeminiClient, AI_MODEL } from '../../../ai/gemini-client';
import { logger } from '../../../utils/logger';

export { isSIInteraction };

const STALE = new Set([10062, 40060]);
function isStale(e: unknown): boolean {
  return !!(e && typeof e === 'object' && 'code' in e && STALE.has((e as { code: number }).code));
}

function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ─────────────────────────────────────────────────────────────────────────────
export class InboxService {
  constructor(
    private readonly permissionManager: PermissionManager,
    /** SUPPORT_STAFF_ROLE_ID — if set, users with this role can also access the inbox */
    private readonly supportStaffRoleId: string | undefined,
  ) {}

  // ── Permission checks ─────────────────────────────────────────────────────

  isSupportStaff(member: GuildMember): boolean {
    try { if (this.permissionManager.isAdmin(member)) return true; } catch { /* ignore */ }
    if (this.supportStaffRoleId) return member.roles.cache.has(this.supportStaffRoleId);
    return false;
  }

  private hasAccess(interaction: Interaction): boolean {
    if (!interaction.guild) return false;
    const member = interaction.member;
    if (!member) return false;
    try { return this.isSupportStaff(member as GuildMember); } catch { return false; }
  }

  // ── DM Capture ────────────────────────────────────────────────────────────

  async onDirectMessage(message: Message, client: Client): Promise<void> {
    if (!message.author || message.author.bot) return;

    // Find the first mutual guild to associate this conversation with
    let guildId = 'dm';
    for (const [, guild] of client.guilds.cache) {
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (member) { guildId = guild.id; break; }
    }

    const attachments = message.attachments.map(a => ({
      name: a.name ?? 'attachment',
      url: a.url,
      size: a.size,
      contentType: a.contentType ?? undefined,
    }));

    let replyToId: string | undefined;
    let replyToContent: string | undefined;
    if (message.reference?.messageId) {
      replyToId = message.reference.messageId;
      try {
        const ref = await message.channel.messages.fetch(message.reference.messageId);
        replyToContent = ref.content?.slice(0, 100);
      } catch { /* not critical */ }
    }

    await addUserMessage(
      message.author.id,
      message.author.tag,
      guildId,
      message.content ?? '',
      attachments,
      {
        msgId: message.id,
        hasEmbeds: message.embeds.length > 0,
        hasStickers: message.stickers.size > 0,
        replyToId,
        replyToContent,
      },
    );

    await updateUserAvatar(message.author.id, message.author.displayAvatarURL({ size: 128 })).catch(() => {});
    logger.info(`[Inbox] DM captured from ${message.author.tag} (${message.author.id})`);
  }

  // ── Interaction Router ────────────────────────────────────────────────────

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!this.hasAccess(interaction)) {
      if (interaction.isRepliable()) {
        await (interaction as ButtonInteraction).reply({
          content: '❌ You do not have permission to access the Support Inbox.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
      return;
    }

    try {
      if (interaction.isButton())           await this.routeButton(interaction, guild);
      else if (interaction.isModalSubmit()) await this.routeModal(interaction, guild);
    } catch (err) {
      if (isStale(err)) return;
      logger.error('[Inbox] Interaction error', err);
      await this.safeErr(interaction, err);
    }
  }

  private async routeButton(i: ButtonInteraction, _guild: Guild): Promise<void> {
    const id = i.customId;

    if (id === SI.HOME)    { await this.showInboxList(i, 'newest', 'all', 0); return; }
    if (id === SI.SEARCH)  { await i.showModal(buildSearchModal()); return; }
    if (id === SI.DM_OPEN) { await i.showModal(buildDMComposerModal()); return; }

    // si:list:<sort>:<filter>:<page>
    if (id.startsWith('si:list:')) {
      const parts  = id.split(':');
      const sort   = (parts[2] ?? 'newest') as InboxSortMode;
      const filter = (parts[3] ?? 'all') as InboxFilterMode;
      const page   = parseInt(parts[4] ?? '0', 10);
      await this.showInboxList(i, sort, filter, page);
      return;
    }

    // si:view:<uid>:<page>
    if (id.startsWith('si:view:')) {
      const parts = id.split(':');
      const uid   = parts[2];
      const page  = parseInt(parts[3] ?? '0', 10);
      if (!uid) return;
      await this.showConversation(i, uid, page);
      return;
    }

    // si:reply:<uid>  (not si:reply_s:)
    if (id.startsWith('si:reply:') && !id.startsWith('si:reply_s:')) {
      const uid = id.slice('si:reply:'.length);
      const conv = await getConversation(uid);
      if (!conv || conv.status === 'closed') {
        await i.reply({ content: '❌ Conversation not found or closed.', flags: MessageFlags.Ephemeral });
        return;
      }
      await i.showModal(buildReplyModal(uid));
      return;
    }

    // si:note:<uid>  (not si:note_s:)
    if (id.startsWith('si:note:') && !id.startsWith('si:note_s:')) {
      const uid = id.slice('si:note:'.length);
      await i.showModal(buildNoteModal(uid));
      return;
    }

    // si:tag:<uid>  (not si:tag_s:)
    if (id.startsWith('si:tag:') && !id.startsWith('si:tag_s:')) {
      const uid = id.slice('si:tag:'.length);
      await i.showModal(buildTagModal(uid));
      return;
    }

    // si:pin:<uid>
    if (id.startsWith('si:pin:')) {
      const uid = id.slice('si:pin:'.length);
      await i.deferUpdate();
      const now = await togglePin(uid);
      logger.info(`[Inbox] ${now ? 'Pinned' : 'Unpinned'} ${uid} by ${i.user.tag}`);
      await this.showConversation(i, uid, 0, true);
      return;
    }

    // si:archive:<uid>
    if (id.startsWith('si:archive:')) {
      const uid = id.slice('si:archive:'.length);
      await i.deferUpdate();
      const now = await toggleArchive(uid);
      logger.info(`[Inbox] ${now ? 'Archived' : 'Unarchived'} ${uid} by ${i.user.tag}`);
      await this.showConversation(i, uid, 0, true);
      return;
    }

    // si:read:<uid>  — toggle read/unread
    if (id.startsWith('si:read:')) {
      const uid = id.slice('si:read:'.length);
      await i.deferUpdate();
      const conv = await getConversation(uid);
      if (conv) {
        if (conv.isRead) await markAsUnread(uid);
        else await markAsRead(uid);
      }
      logger.info(`[Inbox] Toggled read for ${uid} by ${i.user.tag}`);
      await this.showConversation(i, uid, 0, true);
      return;
    }

    // si:close:<uid>
    if (id.startsWith('si:close:')) {
      const uid = id.slice('si:close:'.length);
      await i.deferUpdate();
      await setStatus(uid, 'closed');
      logger.info(`[Inbox] Conversation ${uid} closed by ${i.user.tag}`);
      await this.showConversation(i, uid, 0, true);
      return;
    }

    // si:reopen:<uid>
    if (id.startsWith('si:reopen:')) {
      const uid = id.slice('si:reopen:'.length);
      await i.deferUpdate();
      await setStatus(uid, 'open');
      logger.info(`[Inbox] Conversation ${uid} reopened by ${i.user.tag}`);
      await this.showConversation(i, uid, 0, true);
      return;
    }

    // si:assign:<uid>
    if (id.startsWith('si:assign:')) {
      const uid = id.slice('si:assign:'.length);
      await i.deferUpdate();
      const conv = await getConversation(uid);
      if (!conv) { await i.editReply(buildInfoEmbed('❌ Not Found', 'Conversation not found.', 0xed4245, SI.HOME)); return; }
      if (conv.assignedTo === i.user.id) {
        await assignTo(uid, undefined, undefined);
        logger.info(`[Inbox] Unassigned ${uid} by ${i.user.tag}`);
      } else {
        await assignTo(uid, i.user.id, i.user.tag);
        logger.info(`[Inbox] Assigned ${uid} to ${i.user.tag}`);
      }
      await this.showConversation(i, uid, 0, true);
      return;
    }

    // si:ai:sug:<uid>
    if (id.startsWith('si:ai:sug:')) {
      const uid = id.slice('si:ai:sug:'.length);
      await i.deferUpdate();
      await this.aiSuggestReply(i, uid);
      return;
    }

    // si:ai:sum:<uid>
    if (id.startsWith('si:ai:sum:')) {
      const uid = id.slice('si:ai:sum:'.length);
      await i.deferUpdate();
      await this.aiSummarize(i, uid);
      return;
    }

    // si:ai:tr:<uid>
    if (id.startsWith('si:ai:tr:')) {
      const uid = id.slice('si:ai:tr:'.length);
      await i.deferUpdate();
      await this.aiTranslate(i, uid);
      return;
    }

    // si:ai:rw:<uid>  (not si:ai:rw_s:)
    if (id.startsWith('si:ai:rw:') && !id.startsWith('si:ai:rw_s:')) {
      const uid = id.slice('si:ai:rw:'.length);
      await i.showModal(buildRewriteModal(uid));
      return;
    }
  }

  private async routeModal(i: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = i.customId;

    if (id === SI.SEARCH_SUBMIT)             { await this.handleSearch(i);            return; }
    if (id === SI.DM_SUBMIT)                 { await this.handleDMCompose(i, guild);  return; }
    if (id.startsWith('si:reply_s:'))        { await this.handleReply(i, id.slice('si:reply_s:'.length), guild); return; }
    if (id.startsWith('si:note_s:'))         { await this.handleNote(i, id.slice('si:note_s:'.length)); return; }
    if (id.startsWith('si:tag_s:'))          { await this.handleTag(i, id.slice('si:tag_s:'.length)); return; }
    if (id.startsWith('si:ai:rw_s:'))        { await this.handleAIRewrite(i, id.slice('si:ai:rw_s:'.length)); return; }
  }

  // ── Inbox List ────────────────────────────────────────────────────────────

  async showInboxList(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    sort: InboxSortMode,
    filter: InboxFilterMode,
    page: number,
    alreadyDeferred = false,
  ): Promise<void> {
    if (!alreadyDeferred) {
      if (interaction.isButton()) await interaction.deferUpdate();
      else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    const all     = await getAllConversations();
    const sorted  = sortConversations(filterConversations(all, filter), sort);
    const unread  = getTotalUnread(all);
    await interaction.editReply(buildInboxList(sorted, sort, filter, page, unread));
  }

  // ── Conversation View ─────────────────────────────────────────────────────

  private async showConversation(
    i: ButtonInteraction,
    uid: string,
    page: number,
    alreadyDeferred = false,
  ): Promise<void> {
    if (!alreadyDeferred) await i.deferUpdate();
    const conv = await getConversation(uid);
    if (!conv) {
      await i.editReply(buildInfoEmbed('❌ Not Found', 'Conversation not found.', 0xed4245, SI.HOME, '📥 Inbox'));
      return;
    }
    if (!conv.isRead) await markAsRead(uid);
    await i.editReply(buildConversationView(conv, page));
  }

  // ── Reply ─────────────────────────────────────────────────────────────────

  private async handleReply(i: ModalSubmitInteraction, uid: string, guild: Guild): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const content = i.fields.getTextInputValue('content').trim();
    if (!content) { await i.editReply({ content: '❌ Reply cannot be empty.' }); return; }

    const conv = await getConversation(uid);
    if (!conv)                     { await i.editReply({ content: '❌ Conversation not found.' }); return; }
    if (conv.status === 'closed')  { await i.editReply({ content: '❌ Conversation is closed. Reopen it first.' }); return; }

    // Send the actual DM as a plain message
    try {
      const client = (i as unknown as { client: Client }).client;
      const user   = await client.users.fetch(uid);
      await user.send({ content });
    } catch (err) {
      logger.error(`[Inbox] Failed to DM user ${uid}`, err);
      await i.editReply({ content: `❌ Could not DM this user. They may have DMs disabled.\n\`${err instanceof Error ? err.message : String(err)}\`` });
      return;
    }

    const msgId = `reply_${Date.now()}`;
    await addStaffReply(uid, i.user.id, i.user.tag, content, [], { msgId });
    logger.info(`[Inbox] Staff reply sent to ${uid} by ${i.user.tag}`);
    await i.editReply({ content: `✅ Reply sent to **${conv.userTag}**.` });
  }

  // ── Note ──────────────────────────────────────────────────────────────────

  private async handleNote(i: ModalSubmitInteraction, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const content = i.fields.getTextInputValue('content').trim();
    if (!content) { await i.editReply({ content: '❌ Note cannot be empty.' }); return; }
    const conv = await getConversation(uid);
    if (!conv) { await i.editReply({ content: '❌ Conversation not found.' }); return; }
    await addStaffNote(uid, i.user.id, i.user.tag, content);
    logger.info(`[Inbox] Staff note added to ${uid} by ${i.user.tag}`);
    await i.editReply({ content: `✅ Private note added to **${conv.userTag}**'s conversation.` });
  }

  // ── Tag ───────────────────────────────────────────────────────────────────

  private async handleTag(i: ModalSubmitInteraction, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const tag = i.fields.getTextInputValue('tag').trim();
    const conv = await getConversation(uid);
    if (!conv) { await i.editReply({ content: '❌ Conversation not found.' }); return; }
    const tags = await addTag(uid, tag);
    logger.info(`[Inbox] Tag "${tag}" added to ${uid} by ${i.user.tag}`);
    await i.editReply({ content: `✅ Tag **${tag}** added. Tags: ${tags.join(', ') || 'none'}` });
  }

  // ── DM Composer (message any user by ID) ─────────────────────────────────

  private async handleDMCompose(i: ModalSubmitInteraction, guild: Guild): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const targetId = i.fields.getTextInputValue('user_id').trim();
    const content  = i.fields.getTextInputValue('content').trim();

    if (!content) { await i.editReply({ content: '❌ Message cannot be empty.' }); return; }

    // Fetch user and send
    let userTag = targetId;
    try {
      const client = (i as unknown as { client: Client }).client;
      const user   = await client.users.fetch(targetId);
      userTag = user.tag;
      await user.send({ content });
    } catch (err) {
      logger.error(`[Inbox] DM composer failed for ${targetId}`, err);
      await i.editReply({
        content: `❌ Could not send message to \`${targetId}\`. They may have DMs disabled, or the ID is invalid.\n\`${err instanceof Error ? err.message : String(err)}\``,
      });
      return;
    }

    // Save the outbound message to the inbox (create conversation first if it doesn't exist)
    const msgId = `dm_${Date.now()}`;
    try {
      const existing = await getConversation(targetId);
      if (!existing) {
        // Bootstrap a conversation record so we have somewhere to attach the reply
        await addUserMessage(targetId, userTag, guild.id, '', [], { msgId: `init_${Date.now()}` });
      }
      await addStaffReply(targetId, i.user.id, i.user.tag, content, [], { msgId });
    } catch (err2) {
      logger.error('[Inbox] Could not record outbound DM in conversation', err2);
    }

    logger.info(`[Inbox] DM sent to ${userTag} (${targetId}) by ${i.user.tag}`);
    await i.editReply({ content: `✅ Message sent to **${userTag}**.` });
  }

  // ── Search ────────────────────────────────────────────────────────────────

  private async handleSearch(i: ModalSubmitInteraction): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const query   = i.fields.getTextInputValue('query').trim();
    const all     = await getAllConversations();
    const results = searchConversations(all, query);
    await i.editReply(buildSearchResults(results, query, 'newest', 'all'));
  }

  // ── AI: Suggest Reply ─────────────────────────────────────────────────────

  private async aiSuggestReply(i: ButtonInteraction, uid: string): Promise<void> {
    const conv = await getConversation(uid);
    if (!conv) { await i.editReply(buildInfoEmbed('❌ Not Found', 'Conversation not found.', 0xed4245, SI.HOME)); return; }

    const ai = getGeminiClient();
    if (!ai)  { await i.editReply(buildInfoEmbed('❌ AI Not Configured', 'GEMINI_API_KEY is not set.', 0xed4245, SI.view(uid, 0))); return; }

    const context = conv.messages.filter(m => m.type === 'user').slice(-5)
      .map(m => `User: ${m.content}`).join('\n');

    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `You are a professional support agent. Suggest a concise, helpful reply to this user's latest message. Keep it under 200 words.\n\nConversation:\n${context}\n\nSuggest a reply:` }] }],
      });
      await i.editReply(buildAIResult(conv, 'AI Suggested Reply', res.text ?? 'Could not generate.', 'newest', 'all'));
      logger.info(`[Inbox] AI suggested reply for ${uid} by ${i.user.tag}`);
    } catch (err) {
      logger.error('[Inbox] AI suggest error', err);
      await i.editReply(buildInfoEmbed('❌ AI Error', `${err instanceof Error ? err.message : err}`, 0xed4245, SI.view(uid, 0)));
    }
  }

  // ── AI: Summarize ─────────────────────────────────────────────────────────

  private async aiSummarize(i: ButtonInteraction, uid: string): Promise<void> {
    const conv = await getConversation(uid);
    if (!conv) { await i.editReply(buildInfoEmbed('❌ Not Found', 'Conversation not found.', 0xed4245, SI.HOME)); return; }

    const ai = getGeminiClient();
    if (!ai)  { await i.editReply(buildInfoEmbed('❌ AI Not Configured', 'GEMINI_API_KEY is not set.', 0xed4245, SI.view(uid, 0))); return; }

    const msgs = conv.messages.filter(m => m.type !== 'staff_note').slice(-20)
      .map(m => `${m.type === 'user' ? 'User' : 'Staff'}: ${trunc(m.content, 300)}`).join('\n');

    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Summarize this support conversation in bullet points. Include: main issue, key facts, current status, any actions taken.\n\nConversation:\n${msgs}` }] }],
      });
      await i.editReply(buildAIResult(conv, 'Conversation Summary', res.text ?? 'Could not summarize.', 'newest', 'all'));
      logger.info(`[Inbox] AI summarized ${uid} for ${i.user.tag}`);
    } catch (err) {
      logger.error('[Inbox] AI summarize error', err);
      await i.editReply(buildInfoEmbed('❌ AI Error', `${err instanceof Error ? err.message : err}`, 0xed4245, SI.view(uid, 0)));
    }
  }

  // ── AI: Translate ─────────────────────────────────────────────────────────

  private async aiTranslate(i: ButtonInteraction, uid: string): Promise<void> {
    const conv = await getConversation(uid);
    if (!conv) { await i.editReply(buildInfoEmbed('❌ Not Found', 'Conversation not found.', 0xed4245, SI.HOME)); return; }

    const ai = getGeminiClient();
    if (!ai)  { await i.editReply(buildInfoEmbed('❌ AI Not Configured', 'GEMINI_API_KEY is not set.', 0xed4245, SI.view(uid, 0))); return; }

    const lastUserMsg = conv.messages.filter(m => m.type === 'user').at(-1);
    if (!lastUserMsg?.content) {
      await i.editReply(buildInfoEmbed('ℹ️ Nothing to Translate', 'No user message found.', 0x99aab5, SI.view(uid, 0)));
      return;
    }

    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Detect the language, then translate to English.\n**Language detected:** [language]\n**Translation:**\n[translation]\n\nText:\n${lastUserMsg.content}` }] }],
      });
      await i.editReply(buildAIResult(conv, 'Translation', res.text ?? 'Could not translate.', 'newest', 'all'));
      logger.info(`[Inbox] AI translated last message of ${uid} for ${i.user.tag}`);
    } catch (err) {
      logger.error('[Inbox] AI translate error', err);
      await i.editReply(buildInfoEmbed('❌ AI Error', `${err instanceof Error ? err.message : err}`, 0xed4245, SI.view(uid, 0)));
    }
  }

  // ── AI: Rewrite ───────────────────────────────────────────────────────────

  private async handleAIRewrite(i: ModalSubmitInteraction, uid: string): Promise<void> {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const draft = i.fields.getTextInputValue('draft').trim();
    const conv  = await getConversation(uid);
    if (!conv) { await i.editReply({ content: '❌ Conversation not found.' }); return; }

    const ai = getGeminiClient();
    if (!ai)  { await i.editReply({ content: '❌ GEMINI_API_KEY is not set.' }); return; }

    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Rewrite the following support reply to be professional, clear, empathetic, and concise. Keep the same meaning. Return only the rewritten text, no preamble.\n\nDraft:\n${draft}` }] }],
      });
      await i.editReply(buildAIResult(conv, 'Professionally Rewritten Reply', res.text ?? 'Could not rewrite.', 'newest', 'all'));
      logger.info(`[Inbox] AI rewrote draft for ${uid} by ${i.user.tag}`);
    } catch (err) {
      logger.error('[Inbox] AI rewrite error', err);
      await i.editReply({ content: `❌ AI error: ${err instanceof Error ? err.message : err}` });
    }
  }

  // ── Panel entry for support staff (non-admin) ─────────────────────────────

  async handlePanelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const all    = await getAllConversations();
    const sorted = sortConversations(filterConversations(all, 'all'), 'newest');
    const unread = getTotalUnread(all);
    await interaction.editReply(buildInboxList(sorted, 'newest', 'all', 0, unread));
  }

  // ── Error helper ──────────────────────────────────────────────────────────

  private async safeErr(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    try {
      const r = interaction as ButtonInteraction;
      if (r.deferred || r.replied) await r.editReply({ content: `❌ ${msg}`, embeds: [], components: [] }).catch(() => {});
      else await r.reply({ content: `❌ ${msg}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    } catch { /* silent */ }
  }
}
