import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
  type PartialGuildMember,
  type TextChannel,
} from 'discord.js';
import { getWelcomeConfig, getGoodbyeConfig } from './welcome-store';
import { logger } from '../../utils/logger';

function fillVariables(template: string, member: GuildMember | PartialGuildMember): string {
  return template
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{membercount\}/g, String(member.guild.memberCount));
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export class WelcomeService {
  async handleJoin(member: GuildMember): Promise<void> {
    const cfg = await getWelcomeConfig(member.guild.id);
    if (!cfg.enabled) return;

    try {
      if (cfg.autoRoleIds.length > 0) {
        await member.roles.add(cfg.autoRoleIds).catch(err => logger.error('Auto-role assignment failed', err));
      }
      if (cfg.autoNickname) {
        await member.setNickname(fillVariables(cfg.autoNickname, member)).catch(() => {});
      }

      const send = async () => {
        const template = pickRandom(cfg.messages) ?? '';
        const text = fillVariables(template, member);

        if (cfg.channelId) {
          const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
          if (channel?.isTextBased()) {
            const embed = new EmbedBuilder().setColor(cfg.embedColor).setDescription(text);
            if (cfg.embedTitle) embed.setTitle(fillVariables(cfg.embedTitle, member));
            if (cfg.image) embed.setImage(cfg.image);
            embed.setThumbnail(member.user.displayAvatarURL());
            const components = cfg.buttons.length
              ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
                  cfg.buttons.map(b => new ButtonBuilder().setLabel(b.label).setURL(b.url).setStyle(ButtonStyle.Link).setEmoji(b.emoji ?? '🔗')),
                )]
              : [];
            await (channel as TextChannel).send({ embeds: [embed], components }).catch(err => logger.error('Welcome message send failed', err));
          }
        }

        if (cfg.dmEnabled && cfg.dmMessage) {
          await member.send(fillVariables(cfg.dmMessage, member)).catch(() => {});
        }
      };

      if (cfg.delaySeconds > 0) setTimeout(() => { send().catch(() => {}); }, cfg.delaySeconds * 1000);
      else await send();
    } catch (err) {
      logger.error('Welcome handler error', err);
    }
  }

  async handleLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    const cfg = await getGoodbyeConfig(member.guild.id);
    if (!cfg.enabled) return;

    try {
      const template = pickRandom(cfg.messages) ?? '';
      const text = fillVariables(template, member);

      if (cfg.channelId) {
        const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const embed = new EmbedBuilder().setColor(cfg.embedColor).setDescription(text);
          if (cfg.embedTitle) embed.setTitle(fillVariables(cfg.embedTitle, member));
          if (cfg.image) embed.setImage(cfg.image);
          await (channel as TextChannel).send({ embeds: [embed] }).catch(err => logger.error('Goodbye message send failed', err));
        }
      }

      if (cfg.dmEnabled && cfg.dmMessage) {
        await member.send(fillVariables(cfg.dmMessage, member)).catch(() => {});
      }
    } catch (err) {
      logger.error('Goodbye handler error', err);
    }
  }
}

export const welcomeService = new WelcomeService();
