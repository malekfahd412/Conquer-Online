// ─────────────────────────────────────────────────────────────────────────────
// Welcome Card Designer — Discord-native UI (embeds, buttons, modals).
//
// Mirrors the Ticket Panel Designer's sub-designer pattern: grouped modals
// (Discord caps a modal at 5 text inputs), a toggle button for the border
// on/off state, and a select menu for font family.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { WelcomeConfig, WelcomeCardConfig, WelcomeMessageConfig } from '../welcome-store';
import { FONT_FAMILIES } from '../welcome-card-renderer';
import { CC } from '../../control-center/cc-ids';
import { truncate } from '../../control-center/cc-categories';
import { checkColor, verifyBuilder, assertUniqueCustomIds } from '../../control-center/cc-debug';
import { WC } from './wc-ids';
import type { CCPayload } from '../../control-center/cc-renderer';

const FILE = 'wc-ui.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function btn(label: string, id: string, style: ButtonStyle): ButtonBuilder {
  return verifyBuilder(FILE, 'btn', `btn:${id}`, () =>
    new ButtonBuilder().setLabel(truncate(label, 80)).setCustomId(id).setStyle(style),
  );
}

function homeBtn(): ButtonBuilder { return btn('🏠 Home', CC.HOME, ButtonStyle.Secondary); }
function backBtn(): ButtonBuilder { return btn('← Welcome Card Designer', WC.HOME, ButtonStyle.Secondary); }

function ti(id: string, label: string, value: string, placeholder: string, maxLength = 20, style = TextInputStyle.Short, required = true): TextInputBuilder {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(truncate(label, 45))
    .setStyle(style)
    .setPlaceholder(truncate(placeholder, 100))
    .setRequired(required)
    .setMaxLength(maxLength);
  if (value) input.setValue(value);
  return input;
}

function mrow<T extends TextInputBuilder>(input: T): ActionRowBuilder<T> {
  return new ActionRowBuilder<T>().addComponents(input);
}

function modal(id: string, title: string, ...inputs: TextInputBuilder[]): ModalBuilder {
  return new ModalBuilder().setCustomId(id).setTitle(truncate(title, 45)).addComponents(inputs.map(mrow));
}

// ── Home / dashboard ─────────────────────────────────────────────────────────

export function buildWCHome(cfg: WelcomeConfig): CCPayload {
  const fn = 'buildWCHome';
  const card = cfg.card;
  const color = checkColor(FILE, fn, 'color', cfg.embedColor);

  const cardStatus = card.backgroundImage
    ? `✅ Enabled — background: \`${card.backgroundImage}\``
    : '⚪ Disabled — upload a background image to activate the card. Until then, the classic embed image/thumbnail is used.';

  const wm = cfg.welcomeMessage;
  const msgStatus = (wm.content || wm.embedEnabled)
    ? `✅ Configured${wm.embedEnabled ? ' (with embed)' : ''}`
    : '⚪ Not configured — click ✉️ Welcome Message to set one up.';

  const publishStatus = cfg.channelId
    ? `✅ Publishing to <#${cfg.channelId}>`
    : '⚪ No channel set — click 📢 Publish Welcome to configure.';

  const embed = verifyBuilder(FILE, fn, 'home embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🖼️ Welcome Card Designer')
      .setDescription(
        'Design a ProBot-style dynamic welcome image: background + circular avatar + username, server name and member count text, all positioned exactly where you want.\n\n' +
        `**Card:** ${cardStatus}\n**Welcome Message:** ${msgStatus}\n**Publish:** ${publishStatus}`,
      )
      .addFields(
        {
          name: '🧑 Avatar',
          value: `Position: (${card.avatarX}, ${card.avatarY}) · Size: ${card.avatarSize}px\nBorder: ${card.avatarBorderEnabled ? `On — ${card.avatarBorderColor}, ${card.avatarBorderWidth}px` : 'Off'}`,
          inline: true,
        },
        {
          name: '📝 Text',
          value: `Username: (${card.usernameX}, ${card.usernameY})\nServer name: (${card.serverNameX}, ${card.serverNameY})\nMember count: (${card.memberCountX}, ${card.memberCountY})`,
          inline: true,
        },
        {
          name: '🎨 Style',
          value: `Font: ${card.fontFamily} · Size: ${card.fontSize}px · Color: ${card.textColor}`,
          inline: true,
        },
      )
      .setFooter({ text: 'Positions are pixel coordinates on the generated image — top-left is (0, 0).' }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🖼️ Upload Background', WC.BG_UPLOAD, ButtonStyle.Primary),
    btn('🧑 Avatar Position & Size', WC.AVATAR, ButtonStyle.Secondary),
    btn('🔲 Avatar Border', WC.BORDER, ButtonStyle.Secondary),
    btn('🎨 Text Style', WC.STYLE, ButtonStyle.Secondary),
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('👤 Username Position', WC.TEXT_USERNAME, ButtonStyle.Secondary),
    btn('🏷️ Server Name Position', WC.TEXT_SERVER, ButtonStyle.Secondary),
    btn('🔢 Member Count Position', WC.TEXT_MEMBERS, ButtonStyle.Secondary),
  );
  const row2 = buildFontSelectRow(card.fontFamily);
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✉️ Welcome Message', WC.MSG, ButtonStyle.Primary),
    btn('📢 Publish Welcome', WC.PUBLISH, ButtonStyle.Success),
    btn('🧪 Test Welcome', WC.TEST, ButtonStyle.Secondary),
  );
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('👀 Live Preview', WC.PREVIEW, ButtonStyle.Success),
    btn('← Welcome', CC.cat('welcome'), ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1, row2, row3, row4] };
  assertUniqueCustomIds('buildWCHome', payload);
  return payload;
}

function buildFontSelectRow(current: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = verifyBuilder(FILE, 'buildFontSelectRow', WC.FONT_SELECT, () =>
    new StringSelectMenuBuilder()
      .setCustomId(WC.FONT_SELECT)
      .setPlaceholder(`Font family: ${current}`)
      .addOptions(
        FONT_FAMILIES.map(f =>
          new StringSelectMenuOptionBuilder().setLabel(f).setValue(f).setDefault(f === current),
        ),
      ),
  );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

// ── Border settings page ─────────────────────────────────────────────────────

export function buildWCBorder(cfg: WelcomeConfig): CCPayload {
  const fn = 'buildWCBorder';
  const card = cfg.card;
  const color = checkColor(FILE, fn, 'color', cfg.embedColor);

  const embed = verifyBuilder(FILE, fn, 'border embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🔲 Avatar Border')
      .setDescription(
        `Border is currently **${card.avatarBorderEnabled ? 'ON' : 'OFF'}**.\n\n` +
        `Color: \`${card.avatarBorderColor}\`\nWidth: \`${card.avatarBorderWidth}px\``,
      ),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(card.avatarBorderEnabled ? '🔴 Turn Off' : '🟢 Turn On', WC.BORDER_TOGGLE, card.avatarBorderEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    btn('✏️ Edit Width & Color', WC.BORDER_EDIT, ButtonStyle.Secondary),
    backBtn(),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildWCBorder', payload);
  return payload;
}

// ── Welcome Message editor page ───────────────────────────────────────────────

export function buildWCMsgEditor(cfg: WelcomeConfig): CCPayload {
  const fn = 'buildWCMsgEditor';
  const wm = cfg.welcomeMessage;
  const color = checkColor(FILE, fn, 'color', cfg.embedColor);

  const contentPreview = wm.content
    ? `\`\`\`\n${truncate(wm.content, 300)}\n\`\`\``
    : '_No content set_';

  const embedLines: string[] = [];
  if (wm.embedEnabled) {
    if (wm.embedTitle)       embedLines.push(`**Title:** ${truncate(wm.embedTitle, 60)}`);
    if (wm.embedDescription) embedLines.push(`**Desc:** ${truncate(wm.embedDescription, 80)}`);
    embedLines.push(`**Color:** #${wm.embedColor.toString(16).padStart(6, '0').toUpperCase()}`);
    if (wm.embedFooter)    embedLines.push(`**Footer:** ${truncate(wm.embedFooter, 60)}`);
    if (wm.embedThumbnail) embedLines.push(`**Thumbnail:** set`);
    if (wm.embedImage)     embedLines.push(`**Image:** set`);
    if (wm.embedTimestamp) embedLines.push(`**Timestamp:** on`);
  }

  const embed = verifyBuilder(FILE, fn, 'msg embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('✉️ Welcome Message')
      .setDescription(
        'This message is sent directly below the welcome card image whenever a new member joins.\n\n' +
        'Supported placeholders: `{user}` `{username}` `{displayname}` `{userid}` `{server}` `{membercount}` `{date}` `{time}`',
      )
      .addFields(
        { name: '📄 Content', value: contentPreview, inline: false },
        {
          name: `📋 Embed — ${wm.embedEnabled ? '✅ ON' : '⚪ OFF'}`,
          value: wm.embedEnabled && embedLines.length ? embedLines.join('\n') : '_Disabled_',
          inline: false,
        },
      ),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Content', WC.MSG_CONTENT, ButtonStyle.Primary),
    btn('📝 Edit Embed', WC.MSG_EMBED, ButtonStyle.Secondary),
    btn('🖼️ Media & Timestamp', WC.MSG_MEDIA, ButtonStyle.Secondary),
    btn(wm.embedEnabled ? '🔴 Embed Off' : '🟢 Embed On', WC.MSG_TOGGLE, wm.embedEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    backBtn(),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1] };
  assertUniqueCustomIds('buildWCMsgEditor', payload);
  return payload;
}

// ── Modals ───────────────────────────────────────────────────────────────────

export function buildAvatarModal(card: WelcomeCardConfig): ModalBuilder {
  return modal(
    WC.AVATAR_M,
    'Avatar Position & Size',
    ti('avatarX', 'Avatar X (px)', String(card.avatarX), 'e.g. 40'),
    ti('avatarY', 'Avatar Y (px)', String(card.avatarY), 'e.g. 86'),
    ti('avatarSize', 'Avatar Size (px, diameter)', String(card.avatarSize), 'e.g. 128'),
  );
}

export function buildBorderModal(card: WelcomeCardConfig): ModalBuilder {
  return modal(
    WC.BORDER_M,
    'Avatar Border',
    ti('borderWidth', 'Border Width (px)', String(card.avatarBorderWidth), 'e.g. 6'),
    ti('borderColor', 'Border Color (hex)', card.avatarBorderColor, 'e.g. #FFFFFF', 7),
  );
}

export function buildUsernamePosModal(card: WelcomeCardConfig): ModalBuilder {
  return modal(
    WC.TEXT_USERNAME_M,
    'Username Position',
    ti('x', 'Username X (px)', String(card.usernameX), 'e.g. 195'),
    ti('y', 'Username Y (px)', String(card.usernameY), 'e.g. 118'),
  );
}

export function buildServerNamePosModal(card: WelcomeCardConfig): ModalBuilder {
  return modal(
    WC.TEXT_SERVER_M,
    'Server Name Position',
    ti('x', 'Server Name X (px)', String(card.serverNameX), 'e.g. 195'),
    ti('y', 'Server Name Y (px)', String(card.serverNameY), 'e.g. 160'),
  );
}

export function buildMemberCountPosModal(card: WelcomeCardConfig): ModalBuilder {
  return modal(
    WC.TEXT_MEMBERS_M,
    'Member Count Position',
    ti('x', 'Member Count X (px)', String(card.memberCountX), 'e.g. 195'),
    ti('y', 'Member Count Y (px)', String(card.memberCountY), 'e.g. 196'),
  );
}

export function buildStyleModal(card: WelcomeCardConfig): ModalBuilder {
  return modal(
    WC.STYLE_M,
    'Text Style',
    ti('fontSize', 'Font Size (px)', String(card.fontSize), 'e.g. 30'),
    ti('textColor', 'Text Color (hex)', card.textColor, 'e.g. #FFFFFF', 7),
  );
}

/** Modal 1/3 for welcome message editing — plain text content. */
export function buildMsgContentModal(wm: WelcomeMessageConfig): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Message Content (supports placeholders)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Welcome {user} 👋\n\nWelcome to **{server}**!\n\nPlease read the rules before chatting.')
    .setRequired(false)
    .setMaxLength(2000);
  if (wm.content) input.setValue(wm.content);
  return new ModalBuilder()
    .setCustomId(WC.MSG_CONTENT_M)
    .setTitle('Welcome Message — Content')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

/** Modal 2/3 — embed title, description, color, footer. */
export function buildMsgEmbedModal(wm: WelcomeMessageConfig): ModalBuilder {
  return modal(
    WC.MSG_EMBED_M,
    'Welcome Message — Embed',
    ti('embedTitle',       'Embed Title (optional)',       wm.embedTitle,       'e.g. Welcome to {server}!',   256, TextInputStyle.Short,     false),
    ti('embedDescription', 'Embed Description (optional)', wm.embedDescription, 'e.g. We now have {membercount} members.', 4000, TextInputStyle.Paragraph, false),
    ti('embedColor',       'Embed Color (hex, e.g. #57F287)', `#${wm.embedColor.toString(16).padStart(6, '0').toUpperCase()}`, '#57F287', 7),
    ti('embedFooter',      'Footer Text (optional)',       wm.embedFooter,      'e.g. {server} • {date}',      2048, TextInputStyle.Short,     false),
  );
}

/** Modal 3/3 — thumbnail, image URL, timestamp toggle. */
export function buildMsgMediaModal(wm: WelcomeMessageConfig): ModalBuilder {
  return modal(
    WC.MSG_MEDIA_M,
    'Welcome Message — Media & Timestamp',
    ti('embedThumbnail', 'Thumbnail URL (optional)', wm.embedThumbnail, 'https://...', 500, TextInputStyle.Short, false),
    ti('embedImage',     'Image URL (optional)',      wm.embedImage,     'https://...', 500, TextInputStyle.Short, false),
    ti('embedTimestamp', 'Show Timestamp? (yes / no)', wm.embedTimestamp ? 'yes' : 'no', 'yes or no', 3),
  );
}

/** Modal for Publish — asks for a channel ID (or #mention). */
export function buildPublishModal(currentChannelId?: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('channelId')
    .setLabel('Channel ID or paste a #channel mention')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 1234567890123456789 or <#1234567890123456789>')
    .setRequired(true)
    .setMaxLength(100);
  if (currentChannelId) input.setValue(currentChannelId);
  return new ModalBuilder()
    .setCustomId(WC.PUBLISH_M)
    .setTitle('📢 Publish Welcome')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export function buildWCFeedback(ok: boolean, message: string): CCPayload {
  const embed = new EmbedBuilder()
    .setColor(ok ? 0x57f287 : 0xed4245)
    .setDescription(`${ok ? '✅' : '❌'} ${truncate(message, 2000)}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn(), homeBtn());
  return { content: '', embeds: [embed], components: [row] };
}
