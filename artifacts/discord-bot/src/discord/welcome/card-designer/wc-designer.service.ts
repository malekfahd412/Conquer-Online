import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  type Guild,
  type GuildMember,
  type TextChannel,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type Interaction,
} from 'discord.js';
import type { PermissionManager } from '../../../ai/permission-manager';
import {
  getWelcomeConfig,
  setWelcomeConfig,
  setWelcomeCardConfig,
  setWelcomeMessageConfig,
  type WelcomeCardConfig,
  type WelcomeMessageConfig,
} from '../welcome-store';
import { renderWelcomeCard, saveBackgroundImage, FONT_FAMILIES } from '../welcome-card-renderer';
import {
  buildWCHome,
  buildWCBorder,
  buildWCMsgEditor,
  buildWCFeedback,
  buildAvatarModal,
  buildBorderModal,
  buildUsernamePosModal,
  buildServerNamePosModal,
  buildMemberCountPosModal,
  buildStyleModal,
  buildMsgContentModal,
  buildMsgEmbedModal,
  buildMsgMediaModal,
  buildPublishModal,
} from './wc-ui';
import { WC } from './wc-ids';
import { logger } from '../../../utils/logger';
import { fillWelcomeVariables } from '../welcome.service';

type NavInteraction = ButtonInteraction | StringSelectMenuInteraction;

const UNKNOWN_INTERACTION  = 10062;
const ALREADY_ACKNOWLEDGED = 40060;

function isStale(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return code === UNKNOWN_INTERACTION || code === ALREADY_ACKNOWLEDGED;
  }
  return false;
}

function getField(interaction: ModalSubmitInteraction, key: string): string {
  try {
    return interaction.fields.getTextInputValue(key).trim();
  } catch {
    return '';
  }
}

function parseIntSafe(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw.trim(), 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseHexColor(raw: string, fallback: string): string {
  const clean = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : (/^[0-9a-fA-F]{6}$/.test(clean) ? `#${clean.toUpperCase()}` : fallback);
}

function hexColorToInt(hex: string, fallback: number): number {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return isNaN(n) ? fallback : n;
}

/** Parse a channel ID from raw text — strips Discord mention syntax (<#1234>) if present. */
function parseChannelId(raw: string): string {
  const trimmed = raw.trim();
  const mention = trimmed.match(/^<#(\d+)>$/);
  if (mention) return mention[1];
  return trimmed;
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export class WelcomeCardDesigner {
  constructor(private readonly permissionManager: PermissionManager) {}

  async handleInteraction(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
    guild: Guild,
  ): Promise<void> {
    if (!this.isAdmin(interaction)) {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Admin access required.', flags: MessageFlags.Ephemeral });
      }
      return;
    }

    try {
      if (interaction.isButton()) {
        await this.routeButton(interaction, guild);
      } else if (interaction.isStringSelectMenu()) {
        await this.routeSelectMenu(interaction, guild);
      } else if (interaction.isModalSubmit()) {
        await this.routeModal(interaction, guild);
      }
    } catch (err) {
      if (isStale(err)) {
        logger.info('[WCD] Stale interaction dropped');
        return;
      }
      logger.error('[WCD] Interaction error', err);
      await this.safeError(interaction, err);
    }
  }

  // ── Buttons ────────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    const cfg = await getWelcomeConfig(guild.id);

    switch (id) {
      case WC.HOME:
        await this.nav(interaction, buildWCHome(cfg));
        return;
      case WC.BORDER:
        await this.nav(interaction, buildWCBorder(cfg));
        return;
      case WC.BORDER_TOGGLE: {
        const updated = await setWelcomeCardConfig(guild.id, { avatarBorderEnabled: !cfg.card.avatarBorderEnabled });
        await this.nav(interaction, buildWCBorder(updated));
        return;
      }
      case WC.AVATAR:
        await interaction.showModal(buildAvatarModal(cfg.card));
        return;
      case WC.BORDER_EDIT:
        await interaction.showModal(buildBorderModal(cfg.card));
        return;
      case WC.TEXT_USERNAME:
        await interaction.showModal(buildUsernamePosModal(cfg.card));
        return;
      case WC.TEXT_SERVER:
        await interaction.showModal(buildServerNamePosModal(cfg.card));
        return;
      case WC.TEXT_MEMBERS:
        await interaction.showModal(buildMemberCountPosModal(cfg.card));
        return;
      case WC.STYLE:
        await interaction.showModal(buildStyleModal(cfg.card));
        return;
      case WC.BG_UPLOAD:
        await this.handleBgUpload(interaction, guild);
        return;
      case WC.PREVIEW:
        await this.handlePreview(interaction, guild);
        return;

      // ── Welcome Message editor ────────────────────────────────────────────
      case WC.MSG:
        await this.nav(interaction, buildWCMsgEditor(cfg));
        return;
      case WC.MSG_TOGGLE: {
        const updated = await setWelcomeMessageConfig(guild.id, { embedEnabled: !cfg.welcomeMessage.embedEnabled });
        await this.nav(interaction, buildWCMsgEditor(updated));
        return;
      }
      case WC.MSG_CONTENT:
        await interaction.showModal(buildMsgContentModal(cfg.welcomeMessage));
        return;
      case WC.MSG_EMBED:
        await interaction.showModal(buildMsgEmbedModal(cfg.welcomeMessage));
        return;
      case WC.MSG_MEDIA:
        await interaction.showModal(buildMsgMediaModal(cfg.welcomeMessage));
        return;

      // ── Publish ───────────────────────────────────────────────────────────
      case WC.PUBLISH:
        await interaction.showModal(buildPublishModal(cfg.channelId));
        return;

      // ── Test ──────────────────────────────────────────────────────────────
      case WC.TEST:
        await this.handleTest(interaction, guild);
        return;

      default:
        await this.nav(interaction, buildWCFeedback(false, `Unknown action: \`${id}\``));
    }
  }

  // ── Select menus ─────────────────────────────────────────────────────────────

  private async routeSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    if (interaction.customId !== WC.FONT_SELECT) return;
    const family = interaction.values[0];
    if (!FONT_FAMILIES.includes(family as (typeof FONT_FAMILIES)[number])) {
      await this.nav(interaction, buildWCFeedback(false, `Unknown font family: \`${family}\``));
      return;
    }
    const updated = await setWelcomeCardConfig(guild.id, { fontFamily: family });
    await this.nav(interaction, buildWCHome(updated));
  }

  // ── Modals ───────────────────────────────────────────────────────────────────

  private async routeModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    const cfg = await getWelcomeConfig(guild.id);

    // ── Card config modals ──────────────────────────────────────────────────
    let cardPatch: Partial<WelcomeCardConfig> = {};

    switch (id) {
      case WC.AVATAR_M: {
        cardPatch = {
          avatarX: parseIntSafe(getField(interaction, 'avatarX'), 0, 4000, cfg.card.avatarX),
          avatarY: parseIntSafe(getField(interaction, 'avatarY'), 0, 4000, cfg.card.avatarY),
          avatarSize: parseIntSafe(getField(interaction, 'avatarSize'), 8, 2000, cfg.card.avatarSize),
        };
        const updated = await setWelcomeCardConfig(guild.id, cardPatch);
        await interaction.reply({ ...buildWCHome(updated), flags: MessageFlags.Ephemeral });
        return;
      }
      case WC.BORDER_M: {
        cardPatch = {
          avatarBorderWidth: parseIntSafe(getField(interaction, 'borderWidth'), 0, 100, cfg.card.avatarBorderWidth),
          avatarBorderColor: parseHexColor(getField(interaction, 'borderColor'), cfg.card.avatarBorderColor),
        };
        const updated = await setWelcomeCardConfig(guild.id, cardPatch);
        await interaction.reply({ ...buildWCHome(updated), flags: MessageFlags.Ephemeral });
        return;
      }
      case WC.TEXT_USERNAME_M: {
        cardPatch = {
          usernameX: parseIntSafe(getField(interaction, 'x'), 0, 4000, cfg.card.usernameX),
          usernameY: parseIntSafe(getField(interaction, 'y'), 0, 4000, cfg.card.usernameY),
        };
        const updated = await setWelcomeCardConfig(guild.id, cardPatch);
        await interaction.reply({ ...buildWCHome(updated), flags: MessageFlags.Ephemeral });
        return;
      }
      case WC.TEXT_SERVER_M: {
        cardPatch = {
          serverNameX: parseIntSafe(getField(interaction, 'x'), 0, 4000, cfg.card.serverNameX),
          serverNameY: parseIntSafe(getField(interaction, 'y'), 0, 4000, cfg.card.serverNameY),
        };
        const updated = await setWelcomeCardConfig(guild.id, cardPatch);
        await interaction.reply({ ...buildWCHome(updated), flags: MessageFlags.Ephemeral });
        return;
      }
      case WC.TEXT_MEMBERS_M: {
        cardPatch = {
          memberCountX: parseIntSafe(getField(interaction, 'x'), 0, 4000, cfg.card.memberCountX),
          memberCountY: parseIntSafe(getField(interaction, 'y'), 0, 4000, cfg.card.memberCountY),
        };
        const updated = await setWelcomeCardConfig(guild.id, cardPatch);
        await interaction.reply({ ...buildWCHome(updated), flags: MessageFlags.Ephemeral });
        return;
      }
      case WC.STYLE_M: {
        cardPatch = {
          fontSize: parseIntSafe(getField(interaction, 'fontSize'), 8, 200, cfg.card.fontSize),
          textColor: parseHexColor(getField(interaction, 'textColor'), cfg.card.textColor),
        };
        const updated = await setWelcomeCardConfig(guild.id, cardPatch);
        await interaction.reply({ ...buildWCHome(updated), flags: MessageFlags.Ephemeral });
        return;
      }

      // ── Welcome Message modals ──────────────────────────────────────────
      case WC.MSG_CONTENT_M: {
        const content = getField(interaction, 'content');
        const updated = await setWelcomeMessageConfig(guild.id, { content });
        await interaction.reply({ ...buildWCMsgEditor(updated), flags: MessageFlags.Ephemeral });
        return;
      }
      case WC.MSG_EMBED_M: {
        const msgPatch: Partial<WelcomeMessageConfig> = {
          embedTitle:       getField(interaction, 'embedTitle'),
          embedDescription: getField(interaction, 'embedDescription'),
          embedColor:       hexColorToInt(parseHexColor(getField(interaction, 'embedColor'), `#${cfg.welcomeMessage.embedColor.toString(16).padStart(6, '0')}`), cfg.welcomeMessage.embedColor),
          embedFooter:      getField(interaction, 'embedFooter'),
        };
        const updated = await setWelcomeMessageConfig(guild.id, msgPatch);
        await interaction.reply({ ...buildWCMsgEditor(updated), flags: MessageFlags.Ephemeral });
        return;
      }
      case WC.MSG_MEDIA_M: {
        const tsRaw = getField(interaction, 'embedTimestamp').toLowerCase();
        const msgPatch: Partial<WelcomeMessageConfig> = {
          embedThumbnail: getField(interaction, 'embedThumbnail'),
          embedImage:     getField(interaction, 'embedImage'),
          embedTimestamp: tsRaw === 'yes' || tsRaw === 'true' || tsRaw === '1',
        };
        const updated = await setWelcomeMessageConfig(guild.id, msgPatch);
        await interaction.reply({ ...buildWCMsgEditor(updated), flags: MessageFlags.Ephemeral });
        return;
      }

      // ── Publish modal ──────────────────────────────────────────────────
      case WC.PUBLISH_M: {
        await this.handlePublish(interaction, guild);
        return;
      }

      default:
        await interaction.reply({ ...buildWCFeedback(false, `Unknown modal: \`${id}\``), flags: MessageFlags.Ephemeral });
    }
  }

  // ── Background upload flow ──────────────────────────────────────────────────

  private async handleBgUpload(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.reply({
      content: '📤 Send the background image as an attachment **in this channel** within 60 seconds (PNG, JPEG or WebP).',
      flags: MessageFlags.Ephemeral,
    });

    const channel = interaction.channel;
    if (!channel || !('awaitMessages' in channel)) {
      await interaction.followUp({ content: '❌ This channel does not support message collection.', flags: MessageFlags.Ephemeral });
      return;
    }

    let collected;
    try {
      collected = await channel.awaitMessages({
        filter: m => m.author.id === interaction.user.id && m.attachments.size > 0,
        max: 1,
        time: 60_000,
      });
    } catch {
      collected = null;
    }

    const message = collected?.first();
    if (!message) {
      await interaction.followUp({ content: '⌛ Upload timed out — no changes made.', flags: MessageFlags.Ephemeral });
      return;
    }

    const attachment = message.attachments.first();
    const ext = attachment ? ALLOWED_IMAGE_TYPES[attachment.contentType ?? ''] : undefined;
    if (!attachment || !ext) {
      await interaction.followUp({ content: '❌ That attachment is not a supported image type (PNG, JPEG, WebP).', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const relPath = await saveBackgroundImage(guild.id, buffer, ext);
      const updated = await setWelcomeCardConfig(guild.id, { backgroundImage: relPath });

      await message.delete().catch(() => {});

      const png = await renderWelcomeCard({
        card: updated.card,
        avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
        displayName: (interaction.member as GuildMember)?.displayName ?? interaction.user.username,
        serverName: guild.name,
        memberCount: guild.memberCount,
      });
      const previewFile = new AttachmentBuilder(png, { name: 'welcome-card-preview.png' });

      await interaction.followUp({
        content: '✅ Background saved and the welcome card is now enabled. Here is a live preview:',
        files: [previewFile],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.error('[WCD] Background upload failed', err);
      await interaction.followUp({ content: `❌ Failed to save background image: ${err instanceof Error ? err.message : String(err)}`, flags: MessageFlags.Ephemeral });
    }
  }

  // ── Live preview ─────────────────────────────────────────────────────────────

  private async handlePreview(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = await getWelcomeConfig(guild.id);

    try {
      const png = await renderWelcomeCard({
        card: cfg.card,
        avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
        displayName: (interaction.member as GuildMember)?.displayName ?? interaction.user.username,
        serverName: guild.name,
        memberCount: guild.memberCount,
      });
      const file = new AttachmentBuilder(png, { name: 'welcome-card-preview.png' });
      await interaction.editReply({
        content: cfg.card.backgroundImage
          ? '👀 Live preview (using your own avatar and name as a stand-in for a new member):'
          : '👀 Live preview using the default background — upload one to customize it:',
        files: [file],
      });
    } catch (err) {
      logger.error('[WCD] Preview render failed', err);
      await interaction.editReply({ content: `❌ Failed to render preview: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────────

  private async handlePublish(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const rawId = getField(interaction, 'channelId');
    const channelId = parseChannelId(rawId);

    if (!/^\d{17,20}$/.test(channelId)) {
      await interaction.reply({
        ...buildWCFeedback(false, `Invalid channel ID: \`${rawId}\`. Enter a numeric channel ID or paste a #channel mention.`),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          ...buildWCFeedback(false, `Channel \`${channelId}\` not found or is not a text channel.`),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const updated = await setWelcomeConfig(guild.id, { channelId, enabled: true });
      logger.info(`[WCD] Welcome published to channel ${channelId} in guild ${guild.id}`);
      await interaction.reply({
        ...buildWCFeedback(true, `✅ Welcome system is now **active** in <#${channelId}>!\n\nNew members will automatically receive the welcome card image and configured welcome message.`),
        flags: MessageFlags.Ephemeral,
      });
      // Refresh home with updated config
      await interaction.followUp({ ...buildWCHome(updated), flags: MessageFlags.Ephemeral });
    } catch (err) {
      logger.error('[WCD] Publish failed', err);
      await interaction.reply({
        ...buildWCFeedback(false, `Publish failed: ${err instanceof Error ? err.message : String(err)}`),
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // ── Test Welcome ──────────────────────────────────────────────────────────────

  private async handleTest(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getWelcomeConfig(guild.id);

    if (!cfg.channelId) {
      await interaction.reply({
        content: '❌ No welcome channel configured yet. Click **📢 Publish Welcome** first to set a channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        await interaction.editReply({ content: `❌ Configured channel <#${cfg.channelId}> not found or is not a text channel.` });
        return;
      }

      // Build a fake member-like object from the admin doing the test
      const adminMember = interaction.member as GuildMember;
      const fakeMember = {
        id: adminMember.id,
        user: {
          id: adminMember.id,
          username: adminMember.user.username,
          displayAvatarURL: (opts?: Parameters<typeof adminMember.user.displayAvatarURL>[0]) =>
            adminMember.user.displayAvatarURL(opts),
        },
        displayName: adminMember.displayName,
        guild,
      } as unknown as GuildMember;

      // 1) Send the card image
      const png = await renderWelcomeCard({
        card: cfg.card,
        avatarUrl: adminMember.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
        displayName: adminMember.displayName,
        serverName: guild.name,
        memberCount: guild.memberCount,
      });
      const cardFile = new AttachmentBuilder(png, { name: 'welcome-card.png' });

      const cardEmbed = new EmbedBuilder().setColor(cfg.embedColor);
      const cardText = fillWelcomeVariables(cfg.messages[0] ?? '', fakeMember);
      if (cardText) cardEmbed.setDescription(cardText);
      if (cfg.embedTitle) cardEmbed.setTitle(fillWelcomeVariables(cfg.embedTitle, fakeMember));
      cardEmbed.setImage('attachment://welcome-card.png');

      await (channel as TextChannel).send({ embeds: [cardEmbed], files: [cardFile] });

      // 2) Send the welcome message below it
      const wm = cfg.welcomeMessage;
      const hasContent = wm.content?.trim();
      const hasEmbed = wm.embedEnabled;

      if (hasContent || hasEmbed) {
        const msgContent = hasContent ? fillWelcomeVariables(wm.content, fakeMember) : undefined;
        const embeds: EmbedBuilder[] = [];

        if (hasEmbed) {
          const msgEmbed = new EmbedBuilder().setColor(wm.embedColor || cfg.embedColor);
          let embedHasContent = false;
          if (wm.embedTitle)       { msgEmbed.setTitle(fillWelcomeVariables(wm.embedTitle, fakeMember));                              embedHasContent = true; }
          if (wm.embedDescription) { msgEmbed.setDescription(fillWelcomeVariables(wm.embedDescription, fakeMember));                 embedHasContent = true; }
          if (wm.embedFooter)      { msgEmbed.setFooter({ text: fillWelcomeVariables(wm.embedFooter, fakeMember) });                 embedHasContent = true; }
          if (wm.embedThumbnail)   { msgEmbed.setThumbnail(wm.embedThumbnail);                                                       embedHasContent = true; }
          if (wm.embedImage)       { msgEmbed.setImage(wm.embedImage);                                                               embedHasContent = true; }
          if (wm.embedTimestamp)   { msgEmbed.setTimestamp();                                                                         embedHasContent = true; }
          if (embedHasContent) embeds.push(msgEmbed);
        }

        if (msgContent || embeds.length > 0) {
          await (channel as TextChannel).send({ content: msgContent, embeds });
        }
      }

      await interaction.editReply({
        content: `✅ Test sent to <#${cfg.channelId}>!\n\n_Using your avatar and name as a stand-in for a new member. Nothing was saved._`,
      });
    } catch (err) {
      logger.error('[WCD] Test welcome failed', err);
      await interaction.editReply({ content: `❌ Test failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // ── Nav / error helpers ──────────────────────────────────────────────────────

  private async nav(interaction: NavInteraction, payload: { content: string; embeds: unknown[]; components: unknown[] }): Promise<void> {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload as never);
    } else {
      await interaction.update(payload as never);
    }
  }

  private async safeError(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ ...buildWCFeedback(false, message) } as never).catch(() => {});
      } else {
        await interaction.reply({ ...buildWCFeedback(false, message), flags: MessageFlags.Ephemeral } as never);
      }
    } catch (deliveryErr) {
      if (isStale(deliveryErr)) return;
      logger.error('[WCD] Failed to deliver error', deliveryErr);
    }
  }

  private isAdmin(interaction: Interaction): boolean {
    if (!interaction.guild) return false;
    const member = interaction.member;
    if (!member) return false;
    try {
      return this.permissionManager.isAdmin(member as GuildMember);
    } catch {
      return false;
    }
  }
}
