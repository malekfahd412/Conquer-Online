// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Control Center — Renderer
// Builds all Control Center embeds, panels, select menus and modals.
// Thread-level renders (conversation header, AI sidebar, control panel,
// per-message action rows) remain in ic-renderer.ts and are unchanged.
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
} from 'discord.js';
import type { InboxConversation } from '../../../community/inbox';
import { computeBadgeStatus } from '../../../community/inbox';
import type { InboxSettings } from './inbox-settings-store';
import { CC } from './inbox-cc-ids';

// ─────────────────────────── shared utils ────────────────────────────────────

const BRAND    = 0x5865f2;
const SUCCESS  = 0x57f287;
const WARNING  = 0xfee75c;
const DANGER   = 0xed4245;
const AI_COLOR = 0x9b59b6;
const MUTED    = 0x99aab5;

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function ts(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekStart(): number {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function monthStart(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ─────────────────────── stats computation ───────────────────────────────────

export interface CCStats {
  activeConversations: number;
  waitingUsers: number;
  activeThreads: number;
  closedToday: number;
  avgResponseMs: number;
  staffOnlineCount: number;
  messagesToday: number;
}

export function computeCCStats(convs: InboxConversation[], staffOnlineCount: number): CCStats {
  const dayStart = todayStart();

  const activeConversations = convs.filter(c => c.status === 'open' && !c.isArchived).length;
  const waitingUsers = convs.filter(c => c.status === 'open' && !c.isArchived && !c.isRead).length;
  const activeThreads = convs.filter(c => c.threadId && c.status === 'open').length;

  // Closed today: check last timeline 'closed' event
  const closedToday = convs.filter(c => {
    const lastClose = [...(c.timeline ?? [])].reverse().find(e => e.type === 'closed');
    return lastClose && lastClose.timestamp >= dayStart;
  }).length;

  // Messages today
  const messagesToday = convs.reduce((sum, c) =>
    sum + c.messages.filter(m => m.timestamp >= dayStart && m.type !== 'staff_note').length, 0);

  // Average response time (all-time, first-response per user message)
  let totalMs = 0;
  let count = 0;
  for (const conv of convs) {
    const msgs = [...conv.messages].sort((a, b) => a.timestamp - b.timestamp);
    let pendingUserTs: number | null = null;
    for (const m of msgs) {
      if (m.type === 'user')          { pendingUserTs = m.timestamp; }
      else if (m.type === 'staff_reply' && pendingUserTs !== null) {
        totalMs += m.timestamp - pendingUserTs;
        count++;
        pendingUserTs = null;
      }
    }
  }
  const avgResponseMs = count > 0 ? totalMs / count : 0;

  return { activeConversations, waitingUsers, activeThreads, closedToday, avgResponseMs, staffOnlineCount, messagesToday };
}

// ─────────────────── Control Center dashboard ────────────────────────────────

export interface CCPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

export function buildControlCenter(stats: CCStats): CCPayload {
  const statusIcon = stats.activeConversations === 0 ? '🟢' : stats.waitingUsers > 5 ? '🔴' : '🟡';

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('🛠 Support Inbox Control Center')
    .setDescription('Manage all DM conversations, staff, settings and analytics from one place.\nUse the buttons below to navigate each section.')
    .addFields(
      { name: '📊 Inbox Status',          value: `${statusIcon} Online`,                          inline: true },
      { name: '💬 Active Conversations',  value: `${stats.activeConversations}`,                   inline: true },
      { name: '⏳ Waiting Users',         value: `${stats.waitingUsers}`,                          inline: true },
      { name: '🧵 Active Threads',        value: `${stats.activeThreads}`,                         inline: true },
      { name: '🔒 Closed Today',          value: `${stats.closedToday}`,                           inline: true },
      { name: '⏱ Avg Response',          value: formatDuration(stats.avgResponseMs),              inline: true },
      { name: '👮 Staff Online',          value: `${stats.staffOnlineCount}`,                      inline: true },
      { name: '💬 Messages Today',        value: `${stats.messagesToday}`,                         inline: true },
      { name: '🕒 Last Update',           value: ts(Date.now()),                                   inline: true },
    )
    .setFooter({ text: 'Auto-refreshes every 30 seconds · Staff: type directly in a conversation thread to reply' })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.INBOX)    .setLabel('Inbox')        .setEmoji('📥').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CC.CONVOS())  .setLabel('Conversations').setEmoji('👥').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CC.STATS_DAY) .setLabel('Statistics')   .setEmoji('📊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.SETTINGS)  .setLabel('Settings')     .setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.SEARCH)   .setLabel('Search')       .setEmoji('🔍').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.BROADCAST).setLabel('Broadcast')    .setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.ANNOUNCE) .setLabel('Announcement') .setEmoji('📢').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ic:dash:refresh').setLabel('Refresh') .setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.STAFF)   .setLabel('Staff')  .setEmoji('👮').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.AI_PANEL).setLabel('AI')     .setEmoji('🧠').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.EXPORT)  .setLabel('Export') .setEmoji('📁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.CLEANUP) .setLabel('Cleanup').setEmoji('🧹').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

// ──────────────────────── Inbox panel ────────────────────────────────────────

export function buildInboxPanel(convs: InboxConversation[]): CCPayload {
  const open    = convs.filter(c => c.status === 'open' && !c.isArchived);
  const unread  = open.filter(c => !c.isRead);
  const sorted  = [...open].sort((a, b) => b.lastMessageAt - a.lastMessageAt).slice(0, 15);

  const lines = sorted.length === 0
    ? '_No active conversations._'
    : sorted.map(c => {
        const badge  = !c.isRead ? '🔵' : '⚪';
        const claim  = c.assignedToTag ? ` · 👤 ${c.assignedToTag}` : '';
        const thread = c.threadId ? ` — <#${c.threadId}>` : '';
        const blocked = (c as InboxConversation & { isBlocked?: boolean }).isBlocked ? ' 🚫' : '';
        return `${badge}${blocked} **${trunc(c.userTag, 32)}**${thread}${claim}\n└ ${ts(c.lastMessageAt)}`;
      }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('📥 Inbox — Active Conversations')
    .setDescription(lines)
    .addFields(
      { name: '💬 Open',   value: `${open.length}`,   inline: true },
      { name: '🔵 Unread', value: `${unread.length}`, inline: true },
    )
    .setFooter({ text: 'Showing up to 15 most recent · Use Conversations for full list' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.CONVOS()).setLabel('Manage Conversations').setEmoji('👥').setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

// ──────────────────── Conversations list (paginated) ─────────────────────────

const PAGE_SIZE = 20;

export interface ConvosPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

export function buildConversationsPanel(convs: InboxConversation[], page: number): ConvosPayload {
  const sorted = [...convs].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`👥 Conversations — Page ${safePage + 1}/${totalPages}`)
    .setDescription(`${convs.length} total conversation(s). Select one below to manage it.`)
    .setFooter({ text: 'Select a conversation from the dropdown to open its management panel.' })
    .setTimestamp();

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (slice.length > 0) {
    const options = slice.map(c => {
      const badge = computeBadgeStatus(c);
      const badgeEmoji: Record<string, string> = {
        waiting_for_staff: '🟡', waiting_for_user: '🟢', claimed: '🙋', closed: '🔒', archived: '📦',
      };
      const blocked = (c as InboxConversation & { isBlocked?: boolean }).isBlocked ? ' 🚫' : '';
      const description = `${badgeEmoji[badge] ?? '⚪'} ${badge.replace(/_/g, ' ')} · ${new Date(c.lastMessageAt).toLocaleDateString()}`;
      return new StringSelectMenuOptionBuilder()
        .setLabel(trunc(`${c.userTag}${blocked}`, 100))
        .setDescription(trunc(description, 100))
        .setValue(c.userId);
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(CC.CONVOS_SELECT)
      .setPlaceholder('Select a conversation to manage…')
      .addOptions(options);

    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as unknown as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>);
  }

  const navRow = new ActionRowBuilder<ButtonBuilder>();
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(CC.CONVOS(safePage - 1))
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(CC.CONVOS(safePage + 1))
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );
  components.push(navRow as unknown as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>);

  return { embeds: [embed], components };
}

// ─────────────────── Conversation management panel ───────────────────────────

export function buildConversationPanel(conv: InboxConversation): CCPayload {
  const badge = computeBadgeStatus(conv);
  const isBlocked = !!(conv as InboxConversation & { isBlocked?: boolean }).isBlocked;
  const colors: Record<string, number> = {
    closed: DANGER, archived: MUTED, claimed: BRAND,
    waiting_for_staff: WARNING, waiting_for_user: SUCCESS,
  };

  const userMsgs  = conv.messages.filter(m => m.type === 'user').length;
  const staffMsgs = conv.messages.filter(m => m.type === 'staff_reply').length;
  const notes     = conv.messages.filter(m => m.type === 'staff_note').length;
  const lastMsg   = conv.messages[conv.messages.length - 1];

  const embed = new EmbedBuilder()
    .setColor(colors[badge] ?? BRAND)
    .setTitle(`👤 ${trunc(conv.userTag, 50)}`)
    .setThumbnail(conv.userAvatar ?? null)
    .addFields(
      { name: '🪪 User ID',        value: `\`${conv.userId}\``,                                          inline: true },
      { name: '📛 Status',         value: isBlocked ? '🚫 Blocked' : `${badge.replace(/_/g, ' ')}`,    inline: true },
      { name: '👤 Assigned',       value: conv.assignedToTag ?? '_Unassigned_',                          inline: true },
      { name: '🧵 Thread',         value: conv.threadId ? `<#${conv.threadId}>` : '_No thread yet_',    inline: true },
      { name: '💬 Messages',       value: `${userMsgs} user · ${staffMsgs} staff · ${notes} notes`,     inline: true },
      { name: '🕒 Last Message',   value: lastMsg ? ts(lastMsg.timestamp) : '_None_',                    inline: true },
      { name: '📅 Started',        value: ts(conv.createdAt),                                            inline: true },
      { name: '🏷 Tags',           value: conv.tags.length ? conv.tags.join(', ') : '_None_',            inline: true },
    )
    .setFooter({ text: 'Use the buttons below to manage this conversation.' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.convReply(conv.userId))   .setLabel('Reply')   .setEmoji('💬').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CC.convAssign(conv.userId))  .setLabel('Assign')  .setEmoji('👤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.convTransfer(conv.userId)).setLabel('Transfer').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.convRename(conv.userId))  .setLabel('Rename Thread').setEmoji('✏️').setStyle(ButtonStyle.Secondary).setDisabled(!conv.threadId),
    conv.status === 'closed'
      ? new ButtonBuilder().setCustomId(CC.convClose(conv.userId)).setLabel('Reopen').setEmoji('🔓').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(CC.convClose(conv.userId)).setLabel('Close') .setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    isBlocked
      ? new ButtonBuilder().setCustomId(CC.convUnblock(conv.userId)).setLabel('Unblock').setEmoji('✅').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(CC.convBlock(conv.userId))  .setLabel('Block')  .setEmoji('🚫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CC.convDeleteThread(conv.userId)).setLabel('Delete Thread').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!conv.threadId),
    new ButtonBuilder().setLabel('Open Discord Profile').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(`https://discord.com/users/${conv.userId}`),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ───────────────────────── Statistics panel ──────────────────────────────────

export function buildStatsPanel(convs: InboxConversation[], period: 'day' | 'week' | 'month'): CCPayload {
  const starts: Record<string, number> = { day: todayStart(), week: weekStart(), month: monthStart() };
  const periodStart = starts[period] ?? todayStart();
  const label: Record<string, string> = { day: 'Today', week: 'This Week', month: 'This Month' };

  // Compute period stats
  const newConvs    = convs.filter(c => c.createdAt >= periodStart).length;
  const closedConvs = convs.filter(c => {
    const lastClose = [...(c.timeline ?? [])].reverse().find(e => e.type === 'closed');
    return lastClose && lastClose.timestamp >= periodStart;
  }).length;
  const totalMsgs   = convs.reduce((sum, c) =>
    sum + c.messages.filter(m => m.timestamp >= periodStart && m.type !== 'staff_note').length, 0);
  const userMsgs    = convs.reduce((sum, c) =>
    sum + c.messages.filter(m => m.timestamp >= periodStart && m.type === 'user').length, 0);
  const staffMsgs   = convs.reduce((sum, c) =>
    sum + c.messages.filter(m => m.timestamp >= periodStart && m.type === 'staff_reply').length, 0);

  // Average response time for period
  let totalMs = 0; let rCount = 0;
  for (const conv of convs) {
    const msgs = [...conv.messages].filter(m => m.timestamp >= periodStart).sort((a, b) => a.timestamp - b.timestamp);
    let pendingTs: number | null = null;
    for (const m of msgs) {
      if (m.type === 'user')        { pendingTs = m.timestamp; }
      else if (m.type === 'staff_reply' && pendingTs !== null) { totalMs += m.timestamp - pendingTs; rCount++; pendingTs = null; }
    }
  }
  const avgMs = rCount > 0 ? totalMs / rCount : 0;

  // Top staff by reply count
  const staffMap = new Map<string, { tag: string; count: number }>();
  for (const conv of convs) {
    for (const m of conv.messages) {
      if (m.type !== 'staff_reply' || m.timestamp < periodStart) continue;
      const entry = staffMap.get(m.authorId) ?? { tag: m.authorTag, count: 0 };
      entry.count++;
      staffMap.set(m.authorId, entry);
    }
  }
  const topStaff = [...staffMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const staffText = topStaff.length
    ? topStaff.map((s, i) => `${i + 1}. **${trunc(s.tag, 30)}** — ${s.count} replies`).join('\n')
    : '_No staff replies this period_';

  // Top users by message count
  const userMap = convs
    .map(c => ({ tag: c.userTag, count: c.messages.filter(m => m.type === 'user' && m.timestamp >= periodStart).length }))
    .filter(u => u.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const userText = userMap.length
    ? userMap.map((u, i) => `${i + 1}. **${trunc(u.tag, 30)}** — ${u.count} messages`).join('\n')
    : '_No user messages this period_';

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`📊 Statistics — ${label[period]}`)
    .addFields(
      { name: '📬 New Conversations',  value: `${newConvs}`,             inline: true },
      { name: '✅ Solved',             value: `${closedConvs}`,           inline: true },
      { name: '⏱ Avg Response',       value: formatDuration(avgMs),      inline: true },
      { name: '💬 Total Messages',     value: `${totalMsgs}`,             inline: true },
      { name: '👤 User Messages',      value: `${userMsgs}`,              inline: true },
      { name: '👮 Staff Replies',      value: `${staffMsgs}`,             inline: true },
      { name: '🏆 Top Staff',         value: staffText,                  inline: false },
      { name: '💬 Top Users',         value: userText,                   inline: false },
    )
    .setFooter({ text: `Period: ${new Date(periodStart).toLocaleDateString()} — now` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.STATS_DAY)  .setLabel('Today').setStyle(period === 'day'   ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.STATS_WEEK) .setLabel('This Week').setStyle(period === 'week'  ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.STATS_MONTH).setLabel('This Month').setStyle(period === 'month' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ─────────────────────────── Settings panel ──────────────────────────────────

export function buildSettingsPanel(settings: InboxSettings): CCPayload {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('⚙️ Support Inbox Settings')
    .setDescription('All settings are editable through the buttons below. Changes take effect immediately.')
    .addFields(
      { name: '📥 Support Channel',   value: settings.supportChannelId ? `<#${settings.supportChannelId}>` : '_Auto-created_',                    inline: true },
      { name: '📋 Log Channel',       value: settings.logChannelId      ? `<#${settings.logChannelId}>`      : '_Not set_',                         inline: true },
      { name: '👮 Staff Roles',       value: settings.staffRoleIds.length ? settings.staffRoleIds.map(r => `<@&${r}>`).join(', ') : '_Not set_',    inline: false },
      { name: '🗨 Greeting Message', value: trunc(settings.greetingMessage, 200),                                                                    inline: false },
      { name: '🧵 Auto-Thread',       value: settings.autoThread    ? '✅ Enabled' : '❌ Disabled',  inline: true },
      { name: '📦 Auto-Archive',      value: settings.autoArchiveDays > 0 ? `✅ After ${settings.autoArchiveDays}d` : '❌ Disabled', inline: true },
      { name: '🔒 Auto-Close',        value: settings.autoCloseDays  > 0 ? `✅ After ${settings.autoCloseDays}d`  : '❌ Disabled', inline: true },
      { name: '🧠 AI Features',       value: settings.aiEnabled     ? '✅ Enabled' : '❌ Disabled',  inline: true },
    )
    .setFooter({ text: 'Settings are saved per server.' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.SET_CHANNEL) .setLabel('Support Channel').setEmoji('📥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.SET_LOGCHAN) .setLabel('Log Channel')    .setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.SET_GREETING).setLabel('Greeting Msg')   .setEmoji('🗨️').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.SET_AUTOTHREAD) .setLabel('Auto-Thread') .setEmoji(settings.autoThread    ? '✅' : '❌').setStyle(settings.autoThread    ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CC.SET_AUTOARCHIVE).setLabel('Auto-Archive').setEmoji(settings.autoArchiveDays > 0 ? '✅' : '❌').setStyle(settings.autoArchiveDays > 0 ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CC.SET_AUTOCLOSE)  .setLabel('Auto-Close') .setEmoji(settings.autoCloseDays  > 0 ? '✅' : '❌').setStyle(settings.autoCloseDays  > 0 ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CC.SET_AI)         .setLabel('AI Features').setEmoji(settings.aiEnabled      ? '✅' : '❌').setStyle(settings.aiEnabled      ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ─────────────────────────── Staff panel ─────────────────────────────────────

export interface StaffMember { id: string; tag: string; lastActive: number }

export function buildStaffPanel(staffMembers: StaffMember[], convs: InboxConversation[]): CCPayload {
  // Compute per-staff reply counts (all time)
  const replyCounts = new Map<string, number>();
  for (const conv of convs) {
    for (const m of conv.messages) {
      if (m.type === 'staff_reply') replyCounts.set(m.authorId, (replyCounts.get(m.authorId) ?? 0) + 1);
    }
  }

  // Assigned conversations per staff
  const assignedCounts = new Map<string, number>();
  for (const conv of convs) {
    if (conv.assignedTo) assignedCounts.set(conv.assignedTo, (assignedCounts.get(conv.assignedTo) ?? 0) + 1);
  }

  const staffText = staffMembers.length === 0
    ? '_No staff active recently._'
    : staffMembers
        .sort((a, b) => b.lastActive - a.lastActive)
        .map(s => {
          const replies  = replyCounts.get(s.id) ?? 0;
          const assigned = assignedCounts.get(s.id) ?? 0;
          return `• **${trunc(s.tag, 30)}** — ${replies} replies · ${assigned} assigned · active ${ts(s.lastActive)}`;
        }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('👮 Staff Overview')
    .setDescription(staffText)
    .addFields(
      { name: '👮 Active Staff',       value: `${staffMembers.length}`,    inline: true },
      { name: '🧵 Assigned Convos',    value: `${[...assignedCounts.values()].reduce((s, n) => s + n, 0)}`, inline: true },
    )
    .setFooter({ text: '"Active" = replied or interacted in the past 10 minutes.' })
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

// ─────────────────────────── Export panel ────────────────────────────────────

export function buildExportPanel(totalConvs: number): CCPayload {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('📁 Export Conversations')
    .setDescription(`Export your support inbox data. All ${totalConvs} conversation(s) are available.\n\n**Formats:** CSV (spreadsheet-ready) or JSON (structured data).\n**Scopes:** All conversations or Today's conversations only.`)
    .addFields(
      { name: '⚠️ Note', value: 'Exports include all message content and user IDs. Handle with care.', inline: false },
    )
    .setFooter({ text: 'Files are sent as Discord attachments (staff-only, ephemeral).' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CC.EXPORT_CSV)  .setLabel('All — CSV')     .setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.EXPORT_JSON) .setLabel('All — JSON')    .setEmoji('📦').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CC.EXPORT_TODAY).setLabel('Today — CSV')   .setEmoji('📅').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ─────────────────────────── AI panel ────────────────────────────────────────

export function buildAIPanel(): CCPayload {
  const embed = new EmbedBuilder()
    .setColor(AI_COLOR)
    .setTitle('🧠 AI Toolkit')
    .setDescription(
      'AI features are available directly inside each conversation thread.\n\n' +
      '**How to access:** Open any conversation thread, then use the pinned **✨ AI Sidebar** message.\n\n' +
      '**Available tools:**\n' +
      '• **✨ Suggest Reply** — AI drafts a reply based on the conversation\n' +
      '• **✨ Rewrite** — Polish your draft into a professional reply\n' +
      '• **✨ Translate** — Translate any text to a target language\n' +
      '• **✨ Summarize** — Bullet-point summary of the conversation\n' +
      '• **✨ Sentiment** — Detect the user\'s mood/frustration level\n' +
      '• **✨ Follow-up** — Suggest a proactive follow-up message',
    )
    .setFooter({ text: 'AI features require GEMINI_API_KEY to be set.' });

  return { embeds: [embed], components: [] };
}

// ─────────────────────────── Cleanup panel ───────────────────────────────────

export function buildCleanupPanel(convs: InboxConversation[]): CCPayload {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleCount = convs.filter(c => c.status === 'closed' && c.updatedAt < thirtyDaysAgo).length;
  const archivedCount = convs.filter(c => c.isArchived).length;

  const embed = new EmbedBuilder()
    .setColor(WARNING)
    .setTitle('🧹 Cleanup')
    .setDescription('Archive old closed conversations to keep the inbox tidy.\n\n⚠️ **This action archives conversations — it does not delete them.** All data is preserved in `inbox.json`.')
    .addFields(
      { name: '🔒 Closed (30+ days old)',  value: `${staleCount} conversation(s)`,  inline: true },
      { name: '📦 Already Archived',       value: `${archivedCount} conversation(s)`, inline: true },
    )
    .setFooter({ text: 'Archiving hides conversations from the active inbox view.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CC.CLEANUP_CONFIRM)
      .setLabel(`Archive ${staleCount} stale conversation(s)`)
      .setEmoji('🧹')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(staleCount === 0),
  );

  return { embeds: [embed], components: [row] };
}

// ─────────────────────── Search results panel ────────────────────────────────

export function buildSearchResultsPanel(query: string, results: InboxConversation[]): CCPayload {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`🔍 Search Results — "${trunc(query, 50)}"`)
    .setDescription(
      results.length === 0
        ? '_No conversations matched your query._'
        : results.slice(0, 15).map(c => {
            const badge = computeBadgeStatus(c);
            const icons: Record<string, string> = { waiting_for_staff: '🟡', waiting_for_user: '🟢', claimed: '🙋', closed: '🔒', archived: '📦' };
            return `${icons[badge] ?? '⚪'} **${trunc(c.userTag, 32)}** (\`${c.userId}\`) — ${ts(c.lastMessageAt)}`;
          }).join('\n'),
    )
    .addFields({ name: '📊 Results', value: `${results.length} match(es)`, inline: true })
    .setFooter({ text: 'Select a result from the list above to manage that conversation.' });

  if (results.length === 0) return { embeds: [embed], components: [] };

  const options = results.slice(0, 20).map(c =>
    new StringSelectMenuOptionBuilder()
      .setLabel(trunc(c.userTag, 100))
      .setDescription(trunc(`ID: ${c.userId}`, 100))
      .setValue(c.userId),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CC.CONVOS_SELECT)
    .setPlaceholder('Select a result to manage…')
    .addOptions(options);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as unknown as ActionRowBuilder<ButtonBuilder>],
  };
}

// ──────────────────────────── Modals ─────────────────────────────────────────

export function buildSearchModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(CC.SEARCH_SUBMIT)
    .setTitle('🔍 Search Conversations')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Search by username, user ID, or message content')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
    );
}

export function buildBroadcastModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(CC.BROADCAST_SUBMIT)
    .setTitle('📝 Broadcast to Open Conversations')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('message')
          .setLabel('Message to send to all open conversations')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1500)
          .setRequired(true),
      ),
    );
}

export function buildAnnouncementModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(CC.ANNOUNCE_SUBMIT)
    .setTitle('📢 Send Announcement')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Announcement title')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('message')
          .setLabel('Announcement body')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1500)
          .setRequired(true),
      ),
    );
}

export function buildConvReplyModal(uid: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(CC.convReplySubmit(uid))
    .setTitle('💬 Reply to User')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message to send to the user\'s DM')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2000)
          .setRequired(true),
      ),
    );
}

export function buildConvAssignModal(uid: string, userTag: string, mode: 'assign' | 'transfer'): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(mode === 'assign' ? CC.convAssignSubmit(uid) : CC.convTransferSubmit(uid))
    .setTitle(mode === 'assign' ? `👤 Assign — ${trunc(userTag, 30)}` : `🔁 Transfer — ${trunc(userTag, 30)}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('staff_id')
          .setLabel('Staff member Discord ID (or leave blank to unassign)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('staff_tag')
          .setLabel('Staff member tag/name (for display)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(50)
          .setRequired(false),
      ),
    );
}

export function buildConvRenameModal(uid: string, currentName: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(CC.convRenameSubmit(uid))
    .setTitle('✏️ Rename Thread')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New thread name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(90)
          .setRequired(true)
          .setValue(trunc(currentName, 90)),
      ),
    );
}

export function buildSetChannelModal(currentId: string | undefined, mode: 'support' | 'log'): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(mode === 'support' ? CC.SET_CHANNEL_SUBMIT : CC.SET_LOGCHAN_SUBMIT)
    .setTitle(mode === 'support' ? '📥 Set Support Channel' : '📋 Set Log Channel')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('channel_id')
          .setLabel('Channel ID (leave blank to use auto-created)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(25)
          .setRequired(false)
          .setValue(currentId ?? ''),
      ),
    );
}

export function buildSetGreetingModal(currentGreeting: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(CC.SET_GREETING_SUBMIT)
    .setTitle('🗨 Set Greeting Message')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('greeting')
          .setLabel('Auto-sent greeting when a new conversation starts')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1500)
          .setRequired(true)
          .setValue(trunc(currentGreeting, 1500)),
      ),
    );
}

// ─────────────────────────── Export helpers ──────────────────────────────────

export function exportToCSV(convs: InboxConversation[]): string {
  const header = 'userId,userTag,status,isRead,isArchived,isBlocked,assignedToTag,threadId,createdAt,lastMessageAt,totalMessages,staffReplies,tags';
  const rows = convs.map(c => {
    const isBlocked = (c as InboxConversation & { isBlocked?: boolean }).isBlocked ?? false;
    const cells = [
      c.userId, c.userTag, c.status,
      c.isRead ? 'true' : 'false',
      c.isArchived ? 'true' : 'false',
      isBlocked ? 'true' : 'false',
      c.assignedToTag ?? '',
      c.threadId ?? '',
      new Date(c.createdAt).toISOString(),
      new Date(c.lastMessageAt).toISOString(),
      c.messages.length,
      c.messages.filter(m => m.type === 'staff_reply').length,
      c.tags.join(';'),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
    return cells.join(',');
  });
  return [header, ...rows].join('\n');
}
