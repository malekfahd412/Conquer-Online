// ─────────────────────────────────────────────────────────────────────────────
// MessageGuardService
//
// Detects unauthorised message deletions inside Ticket channels and Support
// Inbox threads, then logs the event and reposts the deleted message.
//
// "Authorised" means the deleter is one of:
//   • The Discord Administrator permission holder
//   • The configured AI admin role (permissionManager.isAdmin)
//   • A role listed in the ticket panel's adminRoles array
//
// When a user deletes their own message Discord does NOT create an audit-log
// entry, so the absence of a matching entry is treated as self-deletion and
// is always allowed.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AuditLogEvent,
  EmbedBuilder,
  type Message,
  type PartialMessage,
  type GuildMember,
  type TextBasedChannel,
} from 'discord.js';
import { ticketSystem } from '../../community/tickets';
import type { InboxChannelService } from '../control-center/inbox-channel/inbox-channel.service';
import type { PermissionManager } from '../../ai/permission-manager';
import { logger } from '../../utils/logger';

export class MessageGuardService {
  constructor(
    private readonly permissionManager: PermissionManager,
    private readonly inboxChannelService: InboxChannelService,
  ) {}

  async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.guild || message.author?.bot) return;

    const guild   = message.guild;
    const channelId = message.channelId;

    // ── Is this a protected channel? ─────────────────────────────────────────
    const ticket        = await ticketSystem.tickets.getByChannel(channelId);
    const isInboxThread = !ticket && await this.inboxChannelService.isTrackedThread(channelId);
    if (!ticket && !isInboxThread) return;

    // ── Find who deleted the message via the audit log ────────────────────────
    // Give Discord ~600 ms to write the entry before we query.
    await new Promise<void>(r => setTimeout(r, 600));

    let executorId: string | null = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 });
      const entry = logs.entries.find(e => {
        const extra = e.extra as { channel?: { id: string } } | undefined;
        return (
          e.target?.id === message.author?.id &&
          extra?.channel?.id === channelId &&
          Date.now() - e.createdTimestamp < 10_000
        );
      });
      if (entry) executorId = entry.executor?.id ?? null;
    } catch (err) {
      logger.warn('[MessageGuard] Could not fetch audit log', err);
      return;
    }

    // No audit-log entry → the author deleted their own message → allowed.
    if (!executorId) return;

    // ── Authorisation check ───────────────────────────────────────────────────
    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (!executor) return;

    if (await this.isSeniorAdmin(executor, ticket?.panelId)) return;

    // ── Unauthorised: log + repost ────────────────────────────────────────────
    logger.warn(
      `[MessageGuard] Unauthorised deletion by ${executor.user.tag} in #${channelId} ` +
      `(${ticket ? `ticket ${ticket.id}` : 'inbox thread'})`,
    );

    const channel = message.channel as TextBasedChannel;
    if (!channel || !('send' in channel)) return;

    const content     = message.content ?? '';
    const attachments = [...(message.attachments?.values() ?? [])];
    const authorTag   = message.author?.tag ?? 'Unknown User';
    const authorIcon  = message.author?.displayAvatarURL() ?? undefined;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${authorTag} — message restored`, iconURL: authorIcon })
      .setDescription(content || '*[no text content]*')
      .setFooter({ text: `Deleted by ${executor.user.tag} · restored by Message Guard` })
      .setColor(0xffa500)
      .setTimestamp(message.createdAt ?? new Date());

    if (attachments.length) {
      embed.addFields({
        name: `Attachment${attachments.length > 1 ? 's' : ''} (${attachments.length})`,
        value: attachments.map(a => `[${a.name}](${a.url})`).join('\n'),
      });
    }

    await (channel as { send: (...args: unknown[]) => Promise<unknown> })
      .send({ embeds: [embed] })
      .catch(err => logger.error('[MessageGuard] Failed to repost message', err));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async isSeniorAdmin(member: GuildMember, panelId?: string): Promise<boolean> {
    // Bot actions are always allowed.
    if (member.user.bot) return true;

    // Discord-native Administrator permission.
    if (member.permissions.has('Administrator')) return true;

    // Configured AI admin role (covers both tickets and inbox).
    try {
      if (this.permissionManager.isAdmin(member)) return true;
    } catch { /* no-op */ }

    // Ticket panel's own adminRoles list.
    if (panelId) {
      const panel = await ticketSystem.panels.get(panelId).catch(() => null);
      if (panel?.adminRoles?.some(r => member.roles.cache.has(r))) return true;
    }

    return false;
  }
}
