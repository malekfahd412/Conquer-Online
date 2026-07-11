// ─────────────────────────────────────────────────────────────────────────────
// PermissionEngine — computes Discord permission overwrites for ticket
// channels, and gates who is allowed to open a ticket on a given panel.
// Owns no storage; it derives everything from the TicketPanel it is given.
// ─────────────────────────────────────────────────────────────────────────────
import { PermissionFlagsBits, type Guild, type GuildMember, type OverwriteResolvable, type TextChannel } from 'discord.js';
import type { TicketPanel } from './types';

function memberRoleIds(member: GuildMember | null | undefined): string[] {
  if (!member || !('roles' in member)) return [];
  const cache = (member.roles as { cache?: { map: (fn: (r: { id: string }) => string) => string[] } }).cache;
  return cache ? cache.map(r => r.id) : [];
}

export class PermissionEngine {
  /** Returns null when allowed, or a user-facing reason string when blocked. */
  canOpen(panel: TicketPanel, member: GuildMember | null, userId: string): string | null {
    const roleIds = memberRoleIds(member);

    if (panel.blockedUsers.includes(userId)) return 'You are not permitted to open tickets on this panel.';
    if (roleIds.some(id => panel.blockedRoles.includes(id))) return 'You are not permitted to open tickets on this panel.';

    if (panel.allowedUsers.length > 0 || panel.allowedRoles.length > 0) {
      const allowedByUser = panel.allowedUsers.includes(userId);
      const allowedByRole = roleIds.some(id => panel.allowedRoles.includes(id));
      if (!allowedByUser && !allowedByRole) return 'You do not have permission to open tickets here.';
    }

    return null;
  }

  buildOverwrites(guild: Guild, panel: TicketPanel, openerId: string): OverwriteResolvable[] {
    const overwrites: OverwriteResolvable[] = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: openerId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    for (const roleId of panel.supportRoles) {
      overwrites.push({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    for (const roleId of panel.managerRoles) {
      overwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }

    for (const extra of panel.permissions) {
      overwrites.push({
        id: extra.targetId,
        allow: extra.allow as (keyof typeof PermissionFlagsBits)[],
        deny: extra.deny as (keyof typeof PermissionFlagsBits)[],
      } as OverwriteResolvable);
    }

    return overwrites;
  }

  async lockForClose(channel: TextChannel, openerId: string): Promise<void> {
    await channel.permissionOverwrites.edit(openerId, { SendMessages: false }).catch(() => {});
  }

  async unlockForReopen(channel: TextChannel, openerId: string): Promise<void> {
    await channel.permissionOverwrites.edit(openerId, { SendMessages: true }).catch(() => {});
  }
}

export const permissionEngine = new PermissionEngine();
