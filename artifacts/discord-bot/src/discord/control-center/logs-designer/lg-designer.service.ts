import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  RoleSelectMenuInteraction,
  ModalSubmitInteraction,
  Guild,
  TextChannel,
  Interaction,
  GuildMember,
} from 'discord.js';
import type { PermissionManager } from '../../../ai/permission-manager';
import {
  getGuildLogConfig,
  setTypeConfig,
  toggleType,
  toggleIgnoreBots,
  LOG_CATEGORIES,
  type LogType,
  type LogCategoryKey,
} from '../../logging/log-store';
import { buildSampleEmbed } from '../../logging/log-renderer';
import {
  buildLogsDashboard,
  buildCategoryView,
  buildLogTypeDetail,
  buildRolePickerView,
  buildSetChannelModal,
  buildSetColorModal,
  buildSetMentionsModal,
  buildSetIgnoreUsersModal,
  buildSetIgnoreRolesModal,
} from './lg-renderer';
import { CC } from '../cc-ids';
import { logger } from '../../../utils/logger';

const UNKNOWN_INTERACTION  = 10062;
const ALREADY_ACKNOWLEDGED = 40060;

function isStale(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code: unknown }).code;
    return c === UNKNOWN_INTERACTION || c === ALREADY_ACKNOWLEDGED;
  }
  return false;
}

/** Parse comma-separated IDs, stripping whitespace and non-digit characters. */
function parseIds(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map(s => s.replace(/\D/g, ''))
    .filter(s => s.length >= 17 && s.length <= 20);
}

/** Parse a hex color string → number, or undefined if invalid/empty. */
function parseColor(raw: string): number | undefined {
  const cleaned = raw.trim().replace(/^#/, '');
  if (!cleaned) return undefined;
  const n = parseInt(cleaned, 16);
  if (isNaN(n) || n < 0 || n > 0xFFFFFF) return undefined;
  return n;
}

export class LogsDesignerService {
  constructor(private readonly permissionManager: PermissionManager) {}

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!this.isAdmin(interaction)) return;

    try {
      if (interaction.isButton())               await this.routeButton(interaction, guild);
      else if (interaction.isRoleSelectMenu())  await this.routeRoleSelect(interaction, guild);
      else if (interaction.isStringSelectMenu()) await this.routeSelect(interaction, guild);
      else if (interaction.isModalSubmit())      await this.routeModal(interaction, guild);
    } catch (err) {
      if (isStale(err)) { logger.info('[Logs] stale interaction dropped'); return; }
      logger.error('[Logs] interaction error', err);
      await this.safeError(interaction, err);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id    = interaction.customId;
    const parts = id.split(':');
    const ns    = parts[1];
    // For most IDs: parts[2..] = type or category key
    const tail  = parts.slice(2).join(':');

    switch (ns) {
      case 'dash':       return this.showDashboard(interaction, guild);
      case 'cat':        return this.showCategory(interaction, guild, tail as LogCategoryKey);
      case 'type':       return this.showTypeDetail(interaction, guild, tail as LogType);
      case 'toggle':     return this.handleToggle(interaction, guild, tail as LogType);
      case 'togglebots': return this.handleToggleBots(interaction, guild, tail as LogType);
      case 'test':       return this.handleTest(interaction, guild, tail as LogType);
      case 'preview':    return this.handlePreview(interaction, tail as LogType);

      // Modals — just show them
      case 'setch': {
        // Could be 'setch' (show modal) — but NOT 'setch:m' (that's a modal submit, handled in routeModal)
        if (parts[2] !== 'm') {
          const type = tail as LogType;
          await interaction.showModal(buildSetChannelModal(type));
        }
        break;
      }
      case 'setcolor': {
        if (parts[2] !== 'm') {
          const type = tail as LogType;
          const cfg  = await getGuildLogConfig(guild.id);
          await interaction.showModal(buildSetColorModal(type, cfg.types[type]?.color));
        }
        break;
      }
      case 'setmentions': {
        // Legacy modal-based mention setter — still supported for compat
        if (parts[2] !== 'm') {
          const type = tail as LogType;
          const cfg  = await getGuildLogConfig(guild.id);
          await interaction.showModal(buildSetMentionsModal(type, cfg.types[type]?.mentionRoles));
        }
        break;
      }
      case 'setmenrole': {
        // New native role-picker view — replaces the message with a RoleSelectMenu
        if (parts[2] !== 's') {
          const type    = tail as LogType;
          const cfg     = await getGuildLogConfig(guild.id);
          const payload = buildRolePickerView(type, cfg.types[type]?.mentionRoles);
          await interaction.deferUpdate();
          await interaction.editReply(payload);
        }
        break;
      }
      case 'clrmenrole': {
        const type = tail as LogType;
        await setTypeConfig(guild.id, type, { mentionRoles: [] });
        logger.info(`[Logs] ${type} mentionRoles cleared for guild ${guild.id}`);
        const cfg     = await getGuildLogConfig(guild.id);
        const payload = buildLogTypeDetail(type, cfg);
        await interaction.deferUpdate();
        await interaction.editReply(payload);
        break;
      }
      case 'togglecritical': {
        const type       = tail as LogType;
        const cfg        = await getGuildLogConfig(guild.id);
        const next       = !(cfg.types[type]?.mentionCriticalOnly ?? false);
        await setTypeConfig(guild.id, type, { mentionCriticalOnly: next });
        logger.info(`[Logs] ${type} mentionCriticalOnly → ${next} for guild ${guild.id}`);
        const updated    = await getGuildLogConfig(guild.id);
        const payload    = buildLogTypeDetail(type, updated);
        await interaction.deferUpdate();
        await interaction.editReply(payload);
        break;
      }
      case 'setignoreu': {
        if (parts[2] !== 'm') {
          const type = tail as LogType;
          const cfg  = await getGuildLogConfig(guild.id);
          await interaction.showModal(buildSetIgnoreUsersModal(type, cfg.types[type]?.ignoreUsers));
        }
        break;
      }
      case 'setignorer': {
        if (parts[2] !== 'm') {
          const type = tail as LogType;
          const cfg  = await getGuildLogConfig(guild.id);
          await interaction.showModal(buildSetIgnoreRolesModal(type, cfg.types[type]?.ignoreRoles));
        }
        break;
      }
      default:
        await this.showDashboard(interaction, guild);
    }
  }

  // ── Role Select Menu ───────────────────────────────────────────────────────

  private async routeRoleSelect(
    interaction: RoleSelectMenuInteraction,
    guild: Guild,
  ): Promise<void> {
    const id = interaction.customId;
    // lg:setmenrole:s:<type>  — role picker submit
    if (id.startsWith('lg:setmenrole:s:')) {
      const type         = id.slice('lg:setmenrole:s:'.length) as LogType;
      const mentionRoles = interaction.values; // array of selected role IDs (0–5)
      await setTypeConfig(guild.id, type, { mentionRoles });
      logger.info(`[Logs] ${type} mentionRoles (picker) → [${mentionRoles.join(',')}] for guild ${guild.id}`);
      const cfg     = await getGuildLogConfig(guild.id);
      const payload = buildLogTypeDetail(type, cfg);
      await interaction.deferUpdate();
      await interaction.editReply(payload);
    }
  }

  private async routeSelect(
    interaction: StringSelectMenuInteraction,
    guild: Guild,
  ): Promise<void> {
    const id = interaction.customId;
    // lg:catsel:<catKey>
    if (id.startsWith('lg:catsel:')) {
      const type = interaction.values[0] as LogType;
      await this.showTypeDetail(interaction, guild, type);
      return;
    }
    // Legacy lg:typesel
    if (id === 'lg:typesel') {
      await this.showTypeDetail(interaction, guild, interaction.values[0] as LogType);
    }
  }

  private async routeModal(
    interaction: ModalSubmitInteraction,
    guild: Guild,
  ): Promise<void> {
    const id = interaction.customId;

    if (id.startsWith('lg:setch:m:')) {
      return this.handleSetChannel(interaction, guild, id.slice('lg:setch:m:'.length) as LogType);
    }
    if (id.startsWith('lg:setcolor:m:')) {
      return this.handleSetColor(interaction, guild, id.slice('lg:setcolor:m:'.length) as LogType);
    }
    if (id.startsWith('lg:setmentions:m:')) {
      return this.handleSetMentions(interaction, guild, id.slice('lg:setmentions:m:'.length) as LogType);
    }
    if (id.startsWith('lg:setignoreu:m:')) {
      return this.handleSetIgnoreUsers(interaction, guild, id.slice('lg:setignoreu:m:'.length) as LogType);
    }
    if (id.startsWith('lg:setignorer:m:')) {
      return this.handleSetIgnoreRoles(interaction, guild, id.slice('lg:setignorer:m:'.length) as LogType);
    }
  }

  // ── Screens ────────────────────────────────────────────────────────────────

  private async showDashboard(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    guild: Guild,
  ): Promise<void> {
    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogsDashboard(cfg);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async showCategory(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    guild: Guild,
    catKey: LogCategoryKey,
  ): Promise<void> {
    const cat = LOG_CATEGORIES.find(c => c.key === catKey);
    if (!cat) { await this.showDashboard(interaction, guild); return; }
    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildCategoryView(catKey, cfg);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async showTypeDetail(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async handleToggle(
    interaction: ButtonInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const nowEnabled = await toggleType(guild.id, type);
    logger.info(`[Logs] ${type} ${nowEnabled ? 'enabled' : 'disabled'} for guild ${guild.id}`);
    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async handleToggleBots(
    interaction: ButtonInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const nowIgnoring = await toggleIgnoreBots(guild.id, type);
    logger.info(`[Logs] ${type} ignoreBots=${nowIgnoring} for guild ${guild.id}`);
    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async handleSetChannel(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const rawId    = interaction.fields.getTextInputValue('channelId').trim();
    const channelId = rawId || undefined;

    if (channelId) {
      const ch = await guild.channels.fetch(channelId).catch(() => null);
      if (!ch || !ch.isTextBased()) {
        await interaction.reply({
          content: `❌ Channel ID \`${channelId}\` is not a valid text channel in this server.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    await setTypeConfig(guild.id, type, { channelId });
    logger.info(`[Logs] ${type} channel → ${channelId ?? 'none'} for guild ${guild.id}`);

    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      content: channelId ? `✅ Channel set to <#${channelId}>` : '✅ Channel cleared.',
    });
    try { if (interaction.message) await interaction.message.edit(payload); } catch { /* non-fatal */ }
  }

  private async handleSetColor(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const raw   = interaction.fields.getTextInputValue('color').trim();
    const color = parseColor(raw);

    if (raw && color === undefined) {
      await interaction.reply({
        content: `❌ \`${raw}\` is not a valid hex color. Use a format like \`#57f287\` or \`57f287\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await setTypeConfig(guild.id, type, { color });
    logger.info(`[Logs] ${type} color → ${color !== undefined ? `#${color.toString(16)}` : 'default'} for guild ${guild.id}`);

    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      content: color !== undefined ? `✅ Embed color set to \`#${color.toString(16).padStart(6,'0').toUpperCase()}\`` : '✅ Embed color reset to default.',
    });
    try { if (interaction.message) await interaction.message.edit(payload); } catch { /* non-fatal */ }
  }

  private async handleSetMentions(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const raw        = interaction.fields.getTextInputValue('roleIds').trim();
    const mentionRoles = raw ? parseIds(raw) : [];

    await setTypeConfig(guild.id, type, { mentionRoles });
    logger.info(`[Logs] ${type} mentionRoles → [${mentionRoles.join(',')}] for guild ${guild.id}`);

    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      content: mentionRoles.length
        ? `✅ Will mention ${mentionRoles.map(id => `<@&${id}>`).join(' ')} when this log fires.`
        : '✅ Mention roles cleared.',
    });
    try { if (interaction.message) await interaction.message.edit(payload); } catch { /* non-fatal */ }
  }

  private async handleSetIgnoreUsers(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const raw        = interaction.fields.getTextInputValue('userIds').trim();
    const ignoreUsers = raw ? parseIds(raw) : [];

    await setTypeConfig(guild.id, type, { ignoreUsers });
    logger.info(`[Logs] ${type} ignoreUsers → [${ignoreUsers.join(',')}] for guild ${guild.id}`);

    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      content: ignoreUsers.length
        ? `✅ Events from ${ignoreUsers.map(id => `<@${id}>`).join(' ')} will be ignored for this log type.`
        : '✅ Ignore-users list cleared.',
    });
    try { if (interaction.message) await interaction.message.edit(payload); } catch { /* non-fatal */ }
  }

  private async handleSetIgnoreRoles(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const raw        = interaction.fields.getTextInputValue('roleIds').trim();
    const ignoreRoles = raw ? parseIds(raw) : [];

    await setTypeConfig(guild.id, type, { ignoreRoles });
    logger.info(`[Logs] ${type} ignoreRoles → [${ignoreRoles.join(',')}] for guild ${guild.id}`);

    const cfg     = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      content: ignoreRoles.length
        ? `✅ Events from members with ${ignoreRoles.map(id => `<@&${id}>`).join(' ')} will be ignored.`
        : '✅ Ignore-roles list cleared.',
    });
    try { if (interaction.message) await interaction.message.edit(payload); } catch { /* non-fatal */ }
  }

  private async handleTest(
    interaction: ButtonInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { resolveLogConfig } = await import('../../logging/log-store');
    const lcfg = await resolveLogConfig(guild.id, type);

    if (!lcfg) {
      await interaction.editReply('❌ No channel is configured for this log type (and no fallback is set).');
      return;
    }

    const ch = await guild.channels.fetch(lcfg.channelId).catch(() => null);
    if (!ch?.isTextBased()) {
      await interaction.editReply(`❌ Configured channel <#${lcfg.channelId}> is not a text channel or is unreachable.`);
      return;
    }

    try {
      const embed = buildSampleEmbed(type);
      if (lcfg.color !== undefined) embed.setColor(lcfg.color);
      const mentions = lcfg.mentionRoles?.map(id => `<@&${id}>`).join(' ') || undefined;
      await (ch as TextChannel).send({ content: mentions, embeds: [embed] });
      await interaction.editReply(`✅ Test log sent to <#${lcfg.channelId}> successfully.`);
    } catch (err) {
      await interaction.editReply(`❌ Failed to send test: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  private async handlePreview(interaction: ButtonInteraction, type: LogType): Promise<void> {
    const embed = buildSampleEmbed(type);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isAdmin(interaction: Interaction): boolean {
    if (!interaction.guild) return false;
    const member = interaction.member;
    if (!member) return false;
    try {
      return this.permissionManager.isAdmin(member as GuildMember);
    } catch { return false; }
  }

  private async safeError(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('❌ Logs Error')
      .setDescription(message);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('🏠 Home').setCustomId(CC.HOME).setStyle(ButtonStyle.Secondary),
    );
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: [row] });
      } else {
        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
      }
    } catch { /* terminal */ }
  }
}
