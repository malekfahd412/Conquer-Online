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
import { getWelcomeConfig, getGoodbyeConfig, type WelcomeConfig } from './welcome-store';
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
    .replace(/\{membercount\}/g, String(member.guild.memberCount))
    .replace(/\{date\}/g,        now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
    .replace(/\{time\}/g,        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Send the configured welcome message directly below the card image.
 * A no-op if neither plain content nor an embed has been configured.
 */
async function sendWelcomeMessage(
  channel: TextChannel,
  cfg: WelcomeConfig,
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const wm = cfg.welcomeMessage;
  if (!wm) return;

  const hasContent = wm.content?.trim().length > 0;
  const hasEmbed   = wm.embedEnabled;
  if (!hasContent && !hasEmbed) return;

  const content = hasContent ? fillWelcomeVariables(wm.content, member) : undefined;
  const embeds: EmbedBuilder[] = [];

  if (hasEmbed) {
    const embed = new EmbedBuilder().setColor(wm.embedColor || cfg.embedColor);
    if (wm.embedTitle)       embed.setTitle(fillWelcomeVariables(wm.embedTitle, member));
    if (wm.embedDescription) embed.setDescription(fillWelcomeVariables(wm.embedDescription, member));
    if (wm.embedFooter)      embed.setFooter({ text: fillWelcomeVariables(wm.embedFooter, member) });
    if (wm.embedThumbnail)   embed.setThumbnail(wm.embedThumbnail);
    if (wm.embedImage)       embed.setImage(wm.embedImage);
    if (wm.embedTimestamp)   embed.setTimestamp();
    embeds.push(embed);
  }

  await channel.send({ content, embeds }).catch(err => logger.error('Welcome message send failed', err));
}

export class WelcomeService {
  async handleJoin(member: GuildMember): Promise<void> {
    const cfg = await getWelcomeConfig(member.guild.id);

    // Auto-role assignment runs independently of the welcome message toggle —
    // admins may want new members to receive a role on join without a welcome
    // message being enabled at all.
    if (cfg.autoRoleIds.length > 0) {
      await member.roles.add(cfg.autoRoleIds).catch(err => logger.error('Auto-role assignment failed', err));
    }

    if (!cfg.enabled) return;

    try {
      if (cfg.autoNickname) {
        await member.setNickname(fillWelcomeVariables(cfg.autoNickname, member)).catch(() => {});
      }

      const send = async () => {
        // ── Channel post (card embed + welcome message) ─────────────────────
        // Channel delivery is best-effort: a missing/invalid channel never
        // blocks DM delivery below.
        if (cfg.channelId) {
          const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
          if (channel?.isTextBased()) {
            // ── Card embed (existing behaviour, unchanged) ──────────────────
            const template = pickRandom(cfg.messages) ?? '';
            const text = fillWelcomeVariables(template, member);

            const embed = new EmbedBuilder().setColor(cfg.embedColor).setDescription(text);
            if (cfg.embedTitle) embed.setTitle(fillWelcomeVariables(cfg.embedTitle, member));

            // ProBot-style dynamic welcome card: only used once an admin has uploaded
            // a background via the Welcome Card Designer. Until then, behavior is
            // byte-for-byte identical to before (cfg.image + avatar thumbnail).
            let files: AttachmentBuilder[] = [];
            if (cfg.card.backgroundImage) {
              try {
                const png = await renderWelcomeCard({
                  card: cfg.card,
                  avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
                  displayName: member.displayName,
                  serverName: member.guild.name,
                  memberCount: member.guild.memberCount,
                });
                const attachment = new AttachmentBuilder(png, { name: 'welcome-card.png' });
                files = [attachment];
                embed.setImage('attachment://welcome-card.png');
              } catch (err) {
                logger.error('Welcome card render failed — falling back to classic image', err);
                if (cfg.image) embed.setImage(cfg.image);
                embed.setThumbnail(member.user.displayAvatarURL());
              }
            } else {
              if (cfg.image) embed.setImage(cfg.image);
              embed.setThumbnail(member.user.displayAvatarURL());
            }

            const components = cfg.buttons.length
              ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
                  cfg.buttons.map(b => new ButtonBuilder().setLabel(b.label).setURL(b.url).setStyle(ButtonStyle.Link).setEmoji(b.emoji ?? '🔗')),
                )]
              : [];

            await (channel as TextChannel).send({ embeds: [embed], components, files })
              .catch(err => logger.error('Welcome card send failed', err));

            // ── Welcome message (new: sent directly below the card) ─────────
            await sendWelcomeMessage(channel as TextChannel, cfg, member);
          }
        }

        // ── DM — independent of channel delivery ────────────────────────────
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
      const template = pickRandom(cfg.messages) ?? '';
      const text = fillWelcomeVariables(template, member);

      if (cfg.channelId) {
        const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const embed = new EmbedBuilder().setColor(cfg.embedColor).setDescription(text);
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
