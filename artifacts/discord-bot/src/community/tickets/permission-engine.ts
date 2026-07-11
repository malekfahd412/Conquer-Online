// ─────────────────────────────────────────────────────────────────────────────
// PermissionEngine — computes Discord permission overwrites for ticket
// channels, and gates who is allowed to open a ticket on a given panel.
// Owns no storage; it derives everything from the TicketPanel it is given.
// ─────────────────────────────────────────────────────────────────────────────
import { PermissionFlagsBits, type Guild, type GuildMember, type OverwriteResolvable, type TextChannel } from 'discord.js';
import { normalizePanel } from './types';
import type { TicketPanel, TicketMemberPermConfig, TicketStaffPermConfig } from './types';

function memberRoleIds(member: GuildMember | null | undefined): string[] {
  if (!member || !('roles' in member)) return [];
  const cache = (member.roles as { cache?: { map: (fn: (r: { id: string }) => string) => string[] } }).cache;
  return cache ? cache.map(r => r.id) : [];
}

/** Maps TicketMemberPermConfig keys to Discord permission flags. */
const MEMBER_PERM_FLAGS: Record<keyof TicketMemberPermConfig, bigint> = {
  viewChannel:           PermissionFlagsBits.ViewChannel,
  sendMessages:          PermissionFlagsBits.SendMessages,
  attachFiles:           PermissionFlagsBits.AttachFiles,
  embedLinks:            PermissionFlagsBits.EmbedLinks,
  addReactions:          PermissionFlagsBits.AddReactions,
  useExternalEmojis:     PermissionFlagsBits.UseExternalEmojis,
  useExternalStickers:   PermissionFlagsBits.UseExternalStickers,
  mentionEveryone:       PermissionFlagsBits.MentionEveryone,
  createPublicThreads:   PermissionFlagsBits.CreatePublicThreads,
  createPrivateThreads:  PermissionFlagsBits.CreatePrivateThreads,
  sendVoiceMessages:     PermissionFlagsBits.SendVoiceMessages,
  readMessageHistory:    PermissionFlagsBits.ReadMessageHistory,
  useApplicationCommands: PermissionFlagsBits.UseApplicationCommands,
};

/** Maps TicketStaffPermConfig keys to Discord permission flags. */
const STAFF_PERM_FLAGS: Record<keyof TicketStaffPermConfig, bigint | null> = {
  manageMessages:    PermissionFlagsBits.ManageMessages,
  manageThreads:     PermissionFlagsBits.ManageThreads,
  manageChannels:    PermissionFlagsBits.ManageChannels,
  managePermissions: PermissionFlagsBits.ManageRoles,
  mentionEveryone:   PermissionFlagsBits.MentionEveryone,
  manageWebhooks:    PermissionFlagsBits.ManageWebhooks,
  manageEvents:      PermissionFlagsBits.ManageEvents,
  priorityOverride:  null, // runtime-only flag, no Discord bit
};

function memberAllowFlags(cfg: TicketMemberPermConfig): bigint[] {
  return (Object.keys(cfg) as (keyof TicketMemberPermConfig)[])
    .filter(k => cfg[k])
    .map(k => MEMBER_PERM_FLAGS[k])
    .filter((f): f is bigint => f !== null);
}

function memberDenyFlags(cfg: TicketMemberPermConfig): bigint[] {
  return (Object.keys(cfg) as (keyof TicketMemberPermConfig)[])
    .filter(k => !cfg[k])
    .map(k => MEMBER_PERM_FLAGS[k])
    .filter((f): f is bigint => f !== null);
}

function staffExtraFlags(cfg: TicketStaffPermConfig): bigint[] {
  return (Object.keys(cfg) as (keyof TicketStaffPermConfig)[])
    .filter(k => cfg[k] && STAFF_PERM_FLAGS[k] !== null)
    .map(k => STAFF_PERM_FLAGS[k])
    .filter((f): f is bigint => f !== null);
}

export class PermissionEngine {
  /** Returns null when allowed, or a user-facing reason string when blocked. `cfg` should be the ticket-type-resolved config (see `resolveTicketType`). */
  canOpen(cfg: TicketPanel, member: GuildMember | null, userId: string): string | null {
    const roleIds = memberRoleIds(member);

    if (cfg.blockedUsers.includes(userId)) return 'You are not permitted to open tickets on this panel.';
    if (roleIds.some(id => cfg.blockedRoles.includes(id))) return 'You are not permitted to open tickets on this panel.';

    if (cfg.allowedUsers.length > 0 || cfg.allowedRoles.length > 0) {
      const allowedByUser = cfg.allowedUsers.includes(userId);
      const allowedByRole = roleIds.some(id => cfg.allowedRoles.includes(id));
      if (!allowedByUser && !allowedByRole) return 'You do not have permission to open tickets here.';
    }

    return null;
  }

  /** `cfg` should be the ticket-type-resolved config (see `resolveTicketType`) so per-type roles/permissions apply. */
  buildOverwrites(guild: Guild, cfg: TicketPanel, openerId: string): OverwriteResolvable[] {
    const p = normalizePanel(cfg);
    const everyone = guild.roles.everyone.id;

    const overwrites: OverwriteResolvable[] = [];

    // ── Base visibility for @everyone ─────────────────────────────────────
    switch (p.visibility) {
      case 'public':
        // Everyone can view and read history; sending is still blocked by default
        overwrites.push({
          id: everyone,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny:  [PermissionFlagsBits.SendMessages],
        });
        break;
      case 'shared_support':
        // Everyone can view but not write
        overwrites.push({
          id: everyone,
          allow: [PermissionFlagsBits.ViewChannel],
          deny:  [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
        break;
      case 'private':
      case 'support_only':
      default:
        // Private: only the opener and staff
        overwrites.push({ id: everyone, deny: [PermissionFlagsBits.ViewChannel] });
        break;
    }

    // ── Ticket opener ─────────────────────────────────────────────────────
    const openerAllow = memberAllowFlags(p.memberPerms);
    const openerDeny  = memberDenyFlags(p.memberPerms);
    if (openerAllow.length > 0 || openerDeny.length > 0) {
      const entry: OverwriteResolvable = { id: openerId };
      if (openerAllow.length > 0) entry.allow = openerAllow;
      if (openerDeny.length  > 0) entry.deny  = openerDeny;
      overwrites.push(entry);
    } else {
      // Fallback: at minimum allow opener to view their own ticket
      overwrites.push({
        id: openerId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }

    // ── Support roles ─────────────────────────────────────────────────────
    const staffExtra = staffExtraFlags(p.staffPerms);
    const supportBase: bigint[] = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ];
    for (const roleId of p.supportRoles) {
      overwrites.push({ id: roleId, allow: [...new Set([...supportBase, ...staffExtra])] });
    }

    // ── Manager roles ─────────────────────────────────────────────────────
    const managerBase: bigint[] = [
      ...supportBase,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
    ];
    for (const roleId of p.managerRoles) {
      overwrites.push({ id: roleId, allow: [...new Set([...managerBase, ...staffExtra])] });
    }

    // ── Admin roles ───────────────────────────────────────────────────────
    const adminBase: bigint[] = [
      ...managerBase,
      PermissionFlagsBits.ManageRoles,
    ];
    for (const roleId of p.adminRoles) {
      overwrites.push({ id: roleId, allow: [...new Set([...adminBase, ...staffExtra])] });
    }

    // ── Custom permission overwrites ──────────────────────────────────────
    for (const extra of p.permissions) {
      overwrites.push({
        id: extra.targetId,
        allow: extra.allow as (keyof typeof PermissionFlagsBits)[],
        deny:  extra.deny  as (keyof typeof PermissionFlagsBits)[],
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

  /**
   * Removes support/manager/admin role overwrites for a claimed ticket (hideFromOtherStaffOnClaim),
   * then grants the claiming staff member a personal overwrite so they keep access even though
   * their role's overwrite may have just been hidden. `cfg` should be the ticket-type-resolved
   * config so `claimBehaviour`, `supportRoles`, `managerRoles` and `adminRoles` reflect this
   * specific ticket type. Roles kept visible for everyone: managerRoles/adminRoles when
   * `cfg.claimBehaviour.managerOverride` / `adminOverride` are enabled.
   *
   * Deliberately hides by ROLE and re-grants by the individual claimer's USER id — hiding was
   * previously keyed off the claimer's role ids, which kept the whole role (every other member
   * holding it) visible whenever the claimer happened to hold a role being hidden.
   */
  async hideFromOtherStaff(channel: TextChannel, cfg: TicketPanel, claimerId: string): Promise<void> {
    const p = normalizePanel(cfg);
    const keepVisibleRoles = new Set<string>();
    if (p.claimBehaviour.managerOverride) for (const id of p.managerRoles) keepVisibleRoles.add(id);
    if (p.claimBehaviour.adminOverride) for (const id of p.adminRoles) keepVisibleRoles.add(id);

    const allStaffRoles = [...new Set([...p.supportRoles, ...p.managerRoles, ...p.adminRoles])];
    const toHide = allStaffRoles.filter(id => !keepVisibleRoles.has(id));
    for (const roleId of toHide) {
      await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }).catch(() => {});
    }

    // Always keep the claiming staff member personally able to see and work the ticket,
    // even though the support role granting them access may have just been hidden above.
    await channel.permissionOverwrites.edit(claimerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }).catch(() => {});
  }

  /** Restores support/manager/admin role overwrites when a ticket is unclaimed. `cfg` should be the ticket-type-resolved config. */
  async restoreStaffAccess(channel: TextChannel, guild: Guild, cfg: TicketPanel, openerId: string): Promise<void> {
    const overwrites = this.buildOverwrites(guild, cfg, openerId);
    for (const ow of overwrites) {
      await channel.permissionOverwrites.edit(ow as Parameters<typeof channel.permissionOverwrites.edit>[0], {}).catch(() => {});
    }
  }
}

export const permissionEngine = new PermissionEngine();
