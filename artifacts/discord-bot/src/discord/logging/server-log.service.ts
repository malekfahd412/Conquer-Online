import {
  EmbedBuilder,
  type Message,
  type PartialMessage,
  type GuildMember,
  type PartialGuildMember,
  type VoiceState,
  type TextChannel,
  type Guild,
} from 'discord.js';
import { getLogConfig } from './log-store';
import { logger } from '../../utils/logger';

async function sendLog(guild: Guild, logChannelId: string | undefined, embed: EmbedBuilder): Promise<void> {
  if (!logChannelId) return;
  const ch = await guild.channels.fetch(logChannelId).catch(() => null);
  if (ch?.isTextBased()) await (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
}

export class ServerLogService {
  async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.guild || message.author?.bot) return;
    try {
      const cfg = await getLogConfig(message.guild.id);
      if (!cfg.logMessageDelete || !cfg.logChannelId) return;
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🗑️ Message Deleted')
        .setDescription(message.content ? message.content.slice(0, 4000) : '_no cached content_')
        .addFields(
          { name: 'Author', value: message.author ? `${message.author} (${message.author.tag})` : 'Unknown', inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
        )
        .setTimestamp();
      await sendLog(message.guild, cfg.logChannelId, embed);
    } catch (err) {
      logger.error('Message delete log error', err);
    }
  }

  async onMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    try {
      const cfg = await getLogConfig(newMessage.guild.id);
      if (!cfg.logMessageEdit || !cfg.logChannelId) return;
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('✏️ Message Edited')
        .addFields(
          { name: 'Before', value: (oldMessage.content || '_no cached content_').slice(0, 1024) },
          { name: 'After', value: (newMessage.content || '_empty_').slice(0, 1024) },
          { name: 'Author', value: newMessage.author ? `${newMessage.author} (${newMessage.author.tag})` : 'Unknown', inline: true },
          { name: 'Channel', value: `${newMessage.channel}`, inline: true },
        )
        .setTimestamp();
      await sendLog(newMessage.guild, cfg.logChannelId, embed);
    } catch (err) {
      logger.error('Message edit log error', err);
    }
  }

  async onMemberJoin(member: GuildMember): Promise<void> {
    try {
      const cfg = await getLogConfig(member.guild.id);
      if (!cfg.logMemberJoin || !cfg.logChannelId) return;
      const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('📥 Member Joined')
        .setDescription(`${member} (${member.user.tag})`)
        .addFields({ name: 'Account age', value: `${accountAgeDays} day(s)`, inline: true })
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      await sendLog(member.guild, cfg.logChannelId, embed);
    } catch (err) {
      logger.error('Member join log error', err);
    }
  }

  async onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    try {
      const cfg = await getLogConfig(member.guild.id);
      if (!cfg.logMemberLeave || !cfg.logChannelId) return;
      const roles = 'roles' in member && member.roles && 'cache' in member.roles
        ? member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name).join(', ') || 'none'
        : 'unknown';
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('📤 Member Left')
        .setDescription(`${member.user?.tag ?? member.id}`)
        .addFields({ name: 'Roles', value: roles.slice(0, 1024) })
        .setTimestamp();
      await sendLog(member.guild, cfg.logChannelId, embed);
    } catch (err) {
      logger.error('Member leave log error', err);
    }
  }

  async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const guild = newState.guild;
    try {
      const cfg = await getLogConfig(guild.id);
      if (!cfg.logVoiceJoinLeave || !cfg.logChannelId) return;
      if (oldState.channelId === newState.channelId) return;

      let description: string;
      if (!oldState.channelId && newState.channelId) description = `${newState.member} joined 🔊 ${newState.channel?.name}`;
      else if (oldState.channelId && !newState.channelId) description = `${oldState.member} left 🔊 ${oldState.channel?.name}`;
      else description = `${newState.member} moved from 🔊 ${oldState.channel?.name} to 🔊 ${newState.channel?.name}`;

      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🔊 Voice Update').setDescription(description).setTimestamp();
      await sendLog(guild, cfg.logChannelId, embed);
    } catch (err) {
      logger.error('Voice state log error', err);
    }
  }
}

export const serverLogService = new ServerLogService();
