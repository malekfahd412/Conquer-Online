import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  type GuildMember,
  type PartialGuildMember,
  type TextChannel,
} from 'discord.js';
import { getWelcomeConfig, getGoodbyeConfig } from './welcome-store';
import { renderWelcomeCard } from './welcome-card-renderer';
import { logger } from '../../utils/logger';

/**
 * Replace all supported placeholders with live values for the given member.
 *
 * Supported: {user} {username} {displayname} {userid} {server} {membercount} {date} {time}
 *
 * Exported so the Welcome Card Designer can use it for test sends without
 * duplicating the logic.
 */
export function fillWelcomeVariables(template: string, member: GuildMember | PartialGuildMember): string {
  const now = new Date();
  return template
    .replace(/\{user\}/g,        `<@${member.id}>`)
    .replace(/\{username\}/g,    member.user.username)
    .replace(/\{displayname\}/g, member.displayName ?? member.user.username)
    .replace(/\{userid\}/g,      member.id)
    .replace(/\{server\}/g,      member.guild.name)
    .replace(/\{membercount\}/gi, String(member.guild.memberCount))
    .replace(/\{date\}/g,        now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
    .replace(/\{time\}/g,        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
}

export class WelcomeService {
  async handleJoin(member: GuildMember): Promise<void> {
    const cfg = await getWelcomeConfig(member.guild.id);

    // Auto-role assignment runs independently of the welcome toggle —
    // admins may want new members to receive a role on join without a
    // welcome message being enabled at all.
    if (cfg.autoRoleIds.length > 0) {
      await member.roles.add(cfg.autoRoleIds).catch(err => logger.error('Auto-role assignment failed', err));
    }

    if (!cfg.enabled) return;

    try {
      if (cfg.autoNickname) {
        await member.setNickname(fillWelcomeVariables(cfg.autoNickname, member)).catch(() => {});
      }

      const send = async () => {
        // ── Channel post ─────────────────────────────────────────────────────
        // Best-effort: a missing/invalid channel never blocks DM delivery.
        if (cfg.channelId) {
          const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
          if (channel?.isTextBased()) {
            const wm = cfg.welcomeMessage;

            // Welcome text (filled placeholders from the configured message)
            const content = wm.content?.trim()
              ? fillWelcomeVariables(wm.content, member)
              : undefined;

            // Optional embed sent in the same message
            const embeds: EmbedBuilder[] = [];
            if (wm.embedEnabled) {
              const embed = new EmbedBuilder().setColor(wm.embedColor || cfg.embedColor);
              let embedHasContent = false;
              if (wm.embedTitle)       { embed.setTitle(fillWelcomeVariables(wm.embedTitle, member));                embedHasContent = true; }
              if (wm.embedDescription) { embed.setDescription(fillWelcomeVariables(wm.embedDescription, member));   embedHasContent = true; }
              if (wm.embedFooter)      { embed.setFooter({ text: fillWelcomeVariables(wm.embedFooter, member) });   embedHasContent = true; }
              if (wm.embedThumbnail)   { embed.setThumbnail(wm.embedThumbnail);                                     embedHasContent = true; }
              if (wm.embedImage)       { embed.setImage(wm.embedImage);                                             embedHasContent = true; }
              if (wm.embedTimestamp)   { embed.setTimestamp();                                                       embedHasContent = true; }
              if (embedHasContent) embeds.push(embed);
            }

            // Social buttons
            const components = cfg.buttons.length
              ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
                  cfg.buttons.map(b => new ButtonBuilder().setLabel(b.label).setURL(b.url).setStyle(ButtonStyle.Link).setEmoji(b.emoji ?? '🔗')),
                )]
              : [];

            // ── ONE message: card image (plain attachment) + welcome text ─────
            if (cfg.card.backgroundImage) {
              try {
                const png = await renderWelcomeCard({
                  card: cfg.card,
                  avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
                  displayName: member.displayName,
                  serverName: member.guild.name,
                  memberCount: member.guild.memberCount,
                });
                const cardFile = new AttachmentBuilder(png, { name: 'welcome-card.png' });
                await (channel as TextChannel)
                  .send({ content, files: [cardFile], embeds, components })
                  .catch(err => logger.error('Welcome send failed', err));
              } catch (err) {
                logger.error('Welcome card render failed — sending text only', err);
                if (content || embeds.length || components.length) {
                  await (channel as TextChannel).send({ content, embeds, components }).catch(() => {});
                }
              }
            } else if (content || embeds.length || components.length) {
              // No card configured yet — send welcome message on its own
              await (channel as TextChannel)
                .send({ content, embeds, components })
                .catch(err => logger.error('Welcome message send failed', err));
            }
          }
        }

        // ── DM — independent of channel delivery ─────────────────────────────
        if (cfg.dmEnabled && cfg.dmMessage) {
          await member.send(fillWelcomeVariables(cfg.dmMessage, member)).catch(() => {});
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
      const messages: string[] = cfg.messages ?? [];
      const template = messages[Math.floor(Math.random() * messages.length)] ?? '';
      const text = fillWelcomeVariables(template, member);

      if (cfg.channelId) {
        const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const embed = new EmbedBuilder().setColor(cfg.embedColor);
          if (text) embed.setDescription(text);
          if (cfg.embedTitle) embed.setTitle(fillWelcomeVariables(cfg.embedTitle, member));
          if (cfg.image) embed.setImage(cfg.image);
          await (channel as TextChannel).send({ embeds: [embed] }).catch(err => logger.error('Goodbye message send failed', err));
        }
      }

      if (cfg.dmEnabled && cfg.dmMessage) {
        await member.send(fillWelcomeVariables(cfg.dmMessage, member)).catch(() => {});
      }
    } catch (err) {
      logger.error('Goodbye handler error', err);
    }
  }
}

export const welcomeService = new WelcomeService();
