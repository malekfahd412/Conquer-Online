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
  ModalSubmitInteraction,
  Guild,
  TextChannel,
  Interaction,
} from 'discord.js';
import type { PermissionManager } from '../../../ai/permission-manager';
import type { GuildMember } from 'discord.js';
import {
  getGuildLogConfig,
  setTypeConfig,
  toggleType,
  type LogType,
} from '../../logging/log-store';
import { buildSampleEmbed } from '../../logging/log-renderer';
import {
  buildLogsDashboard,
  buildLogTypeDetail,
  buildSetChannelModal,
} from './lg-renderer';
import { LG, isLGInteraction } from './lg-ids';
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

export class LogsDesignerService {
  constructor(private readonly permissionManager: PermissionManager) {}

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!this.isAdmin(interaction)) return;

    try {
      if (interaction.isButton())              await this.routeButton(interaction, guild);
      else if (interaction.isStringSelectMenu()) await this.routeSelect(interaction, guild);
      else if (interaction.isModalSubmit())    await this.routeModal(interaction, guild);
    } catch (err) {
      if (isStale(err)) { logger.info('[Logs] stale interaction dropped'); return; }
      logger.error('[Logs] interaction error', err);
      await this.safeError(interaction, err);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === LG.DASH) {
      await this.showDashboard(interaction, guild);
      return;
    }

    const parts = id.split(':');
    const ns    = parts[1]; // 'type' | 'toggle' | 'setch' | 'test' | 'preview'
    const type  = parts.slice(2).join(':') as LogType;

    switch (ns) {
      case 'type':    await this.showTypeDetail(interaction, guild, type); break;
      case 'toggle':  await this.handleToggle(interaction, guild, type); break;
      case 'setch':   await interaction.showModal(buildSetChannelModal(type)); break;
      case 'test':    await this.handleTest(interaction, guild, type); break;
      case 'preview': await this.handlePreview(interaction, type); break;
      default:
        await this.showDashboard(interaction, guild);
    }
  }

  private async routeSelect(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    if (interaction.customId === LG.TYPESEL) {
      await this.showTypeDetail(interaction, guild, interaction.values[0] as LogType);
    }
  }

  private async routeModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    if (!id.startsWith('lg:setch:m:')) return;
    const type = id.slice('lg:setch:m:'.length) as LogType;
    await this.handleSetChannel(interaction, guild, type);
  }

  // ── Screens ────────────────────────────────────────────────────────────────

  private async showDashboard(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    guild: Guild,
  ): Promise<void> {
    const cfg = await getGuildLogConfig(guild.id);
    const payload = buildLogsDashboard(cfg);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async showTypeDetail(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const cfg = await getGuildLogConfig(guild.id);
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

    const cfg = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async handleSetChannel(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    const rawId = interaction.fields.getTextInputValue('channelId').trim();
    const channelId = rawId || undefined;

    // Validate if provided
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
    logger.info(`[Logs] ${type} channel set to ${channelId ?? 'none'} for guild ${guild.id}`);

    const cfg = await getGuildLogConfig(guild.id);
    const payload = buildLogTypeDetail(type, cfg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      content: channelId ? `✅ Channel set to <#${channelId}>` : '✅ Channel cleared.',
    });

    // Also update the original panel message if possible
    try {
      if (interaction.message) {
        await interaction.message.edit(payload);
      }
    } catch { /* non-fatal */ }
  }

  private async handleTest(
    interaction: ButtonInteraction,
    guild: Guild,
    type: LogType,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { resolveLogChannel } = await import('../../logging/log-store');
    const channelId = await resolveLogChannel(guild.id, type);

    if (!channelId) {
      await interaction.editReply('❌ No channel is configured for this log type (and no fallback is set).');
      return;
    }

    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch?.isTextBased()) {
      await interaction.editReply(`❌ Configured channel <#${channelId}> is not a text channel or is unreachable.`);
      return;
    }

    try {
      const embed = buildSampleEmbed(type);
      await (ch as TextChannel).send({ embeds: [embed] });
      await interaction.editReply(`✅ Test log sent to <#${channelId}> successfully.`);
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
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle('❌ Logs Error').setDescription(message);
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
