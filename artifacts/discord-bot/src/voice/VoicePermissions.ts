import { GuildMember, PermissionFlagsBits } from 'discord.js';

export class VoicePermissions {
  constructor(private readonly adminRoleIdentifier: string) {}

  /**
   * Returns true if the member is allowed to interact with the voice AI.
   * Same logic as PermissionManager — Administrator permission or matching role.
   */
  canUseVoiceAI(member: GuildMember): boolean {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (!this.adminRoleIdentifier) return false;

    return member.roles.cache.some(role => {
      return (
        role.id === this.adminRoleIdentifier ||
        role.name.toLowerCase() === this.adminRoleIdentifier.toLowerCase()
      );
    });
  }

  /**
   * Returns true if the member is in a voice channel that the bot can join.
   */
  isInVoiceChannel(member: GuildMember): boolean {
    return member.voice.channel !== null;
  }
}
