import { EmbedBuilder, MessageFlags, type ChatInputCommandInteraction, type Guild } from 'discord.js';
import { staffService } from './staff.service';
import { buildShiftEmbed, buildShiftStatusEmbed } from './embeds';
import { logger } from '../../utils/logger';

export const SHIFT_COMMAND_NAMES = new Set(['shift']);

function errEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Error').setDescription(msg);
}

export class StaffCommandHandler {
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ Server-only command.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;

    try {
      const sub = interaction.options.getSubcommand();
      switch (sub) {
        case 'start':  return await this.cmdStart(interaction, guild);
        case 'end':    return await this.cmdEnd(interaction, guild);
        case 'status': return await this.cmdStatus(interaction, guild);
        default:
          await interaction.editReply({ content: 'Unknown shift command.' });
      }
    } catch (err) {
      logger.error(`[Staff] /shift ${interaction.options.getSubcommand(false)} error`, err);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      await interaction.editReply({ embeds: [errEmbed(msg)] }).catch(() => {});
    }
  }

  private async cmdStart(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const { ok, profile } = await staffService.startShift(guild.id, i.user.id);
    if (!ok) {
      await i.editReply({ embeds: [errEmbed('You already have a shift in progress. Use `/shift end` first.')] });
      return;
    }
    await i.editReply({ embeds: [buildShiftEmbed('started', profile)] });
  }

  private async cmdEnd(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const { ok, profile, session } = await staffService.endShift(guild.id, i.user.id);
    if (!ok) {
      await i.editReply({ embeds: [errEmbed('You do not have a shift in progress. Use `/shift start` first.')] });
      return;
    }
    await i.editReply({ embeds: [buildShiftEmbed('ended', profile, session?.durationMs)] });
  }

  private async cmdStatus(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const profile = await staffService.getProfile(guild.id, i.user.id);
    await i.editReply({ embeds: [buildShiftStatusEmbed(profile)] });
  }
}

export const staffCommandHandler = new StaffCommandHandler();
