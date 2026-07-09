import {
  type Client,
  type TextChannel,
  type GuildChannel,
  type Role,
  type GuildMember,
  EmbedBuilder,
  AuditLogEvent,
} from 'discord.js';
import { logger } from '../../utils/logger';

export interface ObserverConfig {
  logChannelId: string | undefined;
}

export class GuildObserver {
  private client: Client | null = null;
  private readonly logChannelId: string | undefined;

  constructor(config: ObserverConfig) {
    this.logChannelId = config.logChannelId;
  }

  start(client: Client): void {
    this.client = client;

    client.on('channelCreate', channel => {
      if (!channel.isTextBased() && channel.type !== 4) return;
      const name = 'name' in channel ? (channel as GuildChannel).name : 'unknown';
      logger.info(`[Observer] Channel created: #${name}`);
      this.sendObservationLog('📢 Channel Created', `**#${name}** was created`, 0x5865f2).catch(() => {});
    });

    client.on('channelDelete', channel => {
      const name = 'name' in channel ? (channel as GuildChannel).name : 'unknown';
      logger.info(`[Observer] Channel deleted: #${name}`);
      this.sendObservationLog('🗑️ Channel Deleted', `**#${name}** was deleted`, 0xed4245).catch(() => {});
    });

    client.on('channelUpdate', (oldChannel, newChannel) => {
      const oldName = 'name' in oldChannel ? (oldChannel as GuildChannel).name : '';
      const newName = 'name' in newChannel ? (newChannel as GuildChannel).name : '';
      if (oldName !== newName) {
        logger.info(`[Observer] Channel renamed: #${oldName} → #${newName}`);
        this.sendObservationLog('✏️ Channel Renamed', `**#${oldName}** → **#${newName}**`, 0xfaa61a).catch(() => {});
      }
    });

    client.on('roleCreate', (role: Role) => {
      logger.info(`[Observer] Role created: @${role.name}`);
      this.sendObservationLog('🎭 Role Created', `**@${role.name}** was created`, 0x57f287).catch(() => {});
    });

    client.on('roleDelete', (role: Role) => {
      logger.info(`[Observer] Role deleted: @${role.name}`);
      this.sendObservationLog('🗑️ Role Deleted', `**@${role.name}** was deleted`, 0xed4245).catch(() => {});
    });

    client.on('roleUpdate', (oldRole: Role, newRole: Role) => {
      if (oldRole.name !== newRole.name) {
        logger.info(`[Observer] Role renamed: @${oldRole.name} → @${newRole.name}`);
        this.sendObservationLog('✏️ Role Renamed', `**@${oldRole.name}** → **@${newRole.name}**`, 0xfaa61a).catch(() => {});
      }
    });

    client.on('guildMemberAdd', (member: GuildMember) => {
      logger.info(`[Observer] Member joined: ${member.user.tag}`);
      this.sendObservationLog('👋 Member Joined', `**${member.user.tag}** joined the server`, 0x57f287).catch(() => {});
    });

    client.on('guildMemberRemove', member => {
      const tag = 'user' in member ? member.user.tag : 'Unknown';
      logger.info(`[Observer] Member left: ${tag}`);
      this.sendObservationLog('🚪 Member Left', `**${tag}** left the server`, 0xfaa61a).catch(() => {});
    });

    client.on('guildMemberUpdate', (oldMember, newMember) => {
      // Track nickname changes
      if (oldMember.nickname !== newMember.nickname) {
        logger.info(`[Observer] Nickname changed: ${newMember.user.tag} → "${newMember.nickname ?? 'removed'}"`);
      }
      // Track role additions
      const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
      const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
      if (addedRoles.size > 0 || removedRoles.size > 0) {
        logger.info(`[Observer] Roles updated for ${newMember.user.tag}`);
      }
    });

    client.on('guildScheduledEventCreate', event => {
      logger.info(`[Observer] Event created: ${event.name}`);
      this.sendObservationLog('📅 Event Created', `**${event.name}** was scheduled`, 0x5865f2).catch(() => {});
    });

    client.on('guildScheduledEventDelete', event => {
      if (!event.name) return;
      logger.info(`[Observer] Event deleted: ${event.name}`);
      this.sendObservationLog('🗑️ Event Deleted', `**${event.name}** was deleted`, 0xed4245).catch(() => {});
    });

    client.on('webhookUpdate', channel => {
      const name = 'name' in channel ? (channel as GuildChannel).name : 'unknown';
      logger.info(`[Observer] Webhook updated in #${name}`);
    });

    logger.info('[Observer] Guild observer is active');
  }

  private async sendObservationLog(title: string, description: string, color: number): Promise<void> {
    if (!this.logChannelId || !this.client) return;

    try {
      const channel = await this.client.channels.fetch(this.logChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: 'Guild Observer' });

      await (channel as TextChannel).send({ embeds: [embed] });
    } catch {
      // Observer should never crash the bot
    }
  }

  /**
   * Fetch recent audit log entries for contextual information.
   */
  async getRecentAuditLogs(guildId: string, limit = 5): Promise<string[]> {
    if (!this.client) return [];

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const logs = await guild.fetchAuditLogs({ limit, type: AuditLogEvent.ChannelCreate });
      return logs.entries.map(e => `${e.action} by ${e.executor?.tag ?? 'Unknown'}`);
    } catch {
      return [];
    }
  }
}
