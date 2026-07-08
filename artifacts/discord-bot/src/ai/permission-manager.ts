import type { GuildMember } from 'discord.js';
import { logger } from '../utils/logger';

export class PermissionManager {
  private readonly adminRoleIdentifier: string;

  constructor(adminRoleIdentifier: string) {
    this.adminRoleIdentifier = adminRoleIdentifier.trim();
  }

  isAdmin(member: GuildMember): boolean {
    if (member.permissions.has('Administrator')) return true;

    const hasRole = member.roles.cache.some(
      role =>
        role.id === this.adminRoleIdentifier ||
        role.name.toLowerCase() === this.adminRoleIdentifier.toLowerCase(),
    );

    if (!hasRole) {
      logger.info(`Access denied for ${member.user.tag} — missing admin role`);
    }

    return hasRole;
  }
}
