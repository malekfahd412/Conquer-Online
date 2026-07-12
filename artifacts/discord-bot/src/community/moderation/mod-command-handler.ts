import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  GuildMember,
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
  type TextChannel,
} from 'discord.js';
import {
  checkModPermission,
  canUseModCommands,
  execWarn,
  execUnwarn,
  execClearWarnings,
  execMute,
  execUnmute,
  execKick,
  execBan,
  execTempBan,
  execUnban,
  execSoftBan,
  execPurge,
  execSlowmode,
  execNick,
  execLock,
  execUnlock,
  execRoleChange,
  getHistory,
} from './mod.service';
import { getCase, getUserCases, editCaseReason, deleteCase } from './mod-store';
import { getGuildModConfig } from './mod-config-store';
import { buildCaseEmbed } from './embeds';
import { logger } from '../../utils/logger';

// ── MOD COMMAND NAMES ─────────────────────────────────────────────────────

export const MOD_COMMAND_NAMES = new Set([
  'warn', 'unwarn', 'warnings', 'clearwarnings',
  'mute', 'unmute', 'temptimeout',
  'kick', 'ban', 'unban', 'softban', 'tempban',
  'purge', 'slowmode', 'nick', 'lock', 'unlock', 'role',
  'case', 'history', 'editcase', 'deletecase',
]);

// ── Helpers ────────────────────────────────────────────────────────────────

function errEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Error').setDescription(msg);
}

function okEmbed(msg: string, color = 0x57f287): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setDescription(msg);
}

async function assertMod(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<GuildMember | null> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await interaction.editReply({ embeds: [errEmbed('This command can only be used inside a server.')] });
    return null;
  }
  const cfg = await getGuildModConfig(guild.id);
  if (!canUseModCommands(member, cfg.modRoles)) {
    await interaction.editReply({ embeds: [errEmbed('You do not have permission to use moderation commands.')] });
    return null;
  }
  return member;
}

// ── Main Router ────────────────────────────────────────────────────────────

export class ModerationCommandHandler {
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ Server-only command.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;

    try {
      switch (interaction.commandName) {
        case 'warn':          return await this.cmdWarn(interaction, guild);
        case 'unwarn':        return await this.cmdUnwarn(interaction, guild);
        case 'warnings':      return await this.cmdWarnings(interaction, guild);
        case 'clearwarnings': return await this.cmdClearWarnings(interaction, guild);
        case 'mute':          return await this.cmdMute(interaction, guild);
        case 'temptimeout':   return await this.cmdTempTimeout(interaction, guild);
        case 'unmute':        return await this.cmdUnmute(interaction, guild);
        case 'kick':          return await this.cmdKick(interaction, guild);
        case 'ban':           return await this.cmdBan(interaction, guild);
        case 'tempban':       return await this.cmdTempBan(interaction, guild);
        case 'unban':         return await this.cmdUnban(interaction, guild);
        case 'softban':       return await this.cmdSoftBan(interaction, guild);
        case 'purge':         return await this.cmdPurge(interaction, guild);
        case 'slowmode':      return await this.cmdSlowmode(interaction, guild);
        case 'nick':          return await this.cmdNick(interaction, guild);
        case 'lock':          return await this.cmdLock(interaction, guild);
        case 'unlock':        return await this.cmdUnlock(interaction, guild);
        case 'role':          return await this.cmdRole(interaction, guild);
        case 'case':          return await this.cmdCase(interaction, guild);
        case 'history':       return await this.cmdHistory(interaction, guild);
        case 'editcase':      return await this.cmdEditCase(interaction, guild);
        case 'deletecase':    return await this.cmdDeleteCase(interaction, guild);
        default:
          await interaction.editReply({ content: 'Unknown moderation command.' });
      }
    } catch (err) {
      logger.error(`[Mod] Command /${interaction.commandName} error`, err);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      await interaction.editReply({ embeds: [errEmbed(msg)] }).catch(() => {});
    }
  }

  // ── /warn ──────────────────────────────────────────────────────────────

  private async cmdWarn(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    if (!target) { await i.editReply({ embeds: [errEmbed('User not found in this server.')] }); return; }

    const perm = await checkModPermission(mod, target, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const reason = i.options.getString('reason') ?? '';
    const result = await execWarn(guild, mod, target, reason);

    const embed = buildCaseEmbed(result.case, result.warnCount)
      .setFooter({ text: `Case ${result.case.id} | ⚠️ ${result.warnCount} active warning(s)` });

    let content = '';
    if (result.autoPunishTriggered && result.autoPunishCase) {
      content = `⚡ Auto-punishment triggered at **${result.warnCount} warnings** — Case \`${result.autoPunishCase.id}\` created.`;
    }

    await i.editReply({ content: content || undefined, embeds: [embed] });
  }

  // ── /unwarn ────────────────────────────────────────────────────────────

  private async cmdUnwarn(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const caseId = i.options.getString('case_id', true).toUpperCase();
    const result = await execUnwarn(guild, mod, caseId);
    if (!result) {
      await i.editReply({ embeds: [errEmbed(`Case \`${caseId}\` not found or is not a warning.`)] });
      return;
    }
    await i.editReply({ embeds: [buildCaseEmbed(result.case)] });
  }

  // ── /warnings ──────────────────────────────────────────────────────────

  private async cmdWarnings(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const user = i.options.getUser('user', true);
    const cases = (await getUserCases(guild.id, user.id)).filter(c => c.action === 'warn');
    const active = cases.filter(c => c.active);

    const lines = cases.map(c => {
      const ts = `<t:${Math.floor(c.timestamp / 1000)}:d>`;
      const status = c.active ? '🟡 Active' : '⬛ Resolved';
      return `\`${c.id}\` ${status} — ${ts} — ${c.reason || '_No reason_'}`;
    });

    const embed = new EmbedBuilder()
      .setColor(active.length ? 0xfee75c : 0x57f287)
      .setTitle(`⚠️ Warnings — ${user.tag}`)
      .setDescription(lines.length ? lines.join('\n') : '_No warnings on record._')
      .addFields(
        { name: 'Total Warnings', value: `${cases.length}`, inline: true },
        { name: 'Active Warnings', value: `${active.length}`, inline: true },
      )
      .setTimestamp();

    await i.editReply({ embeds: [embed] });
  }

  // ── /clearwarnings ─────────────────────────────────────────────────────

  private async cmdClearWarnings(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const user = i.options.getUser('user', true);
    const count = await execClearWarnings(guild, mod, user);
    await i.editReply({ embeds: [okEmbed(`✅ Cleared **${count}** active warning(s) for <@${user.id}>.`)] });
  }

  // ── /mute ──────────────────────────────────────────────────────────────

  private async cmdMute(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    if (!target) { await i.editReply({ embeds: [errEmbed('User not found in this server.')] }); return; }

    const perm = await checkModPermission(mod, target, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const durationStr = i.options.getString('duration', true);
    const reason      = i.options.getString('reason') ?? '';

    const c = await execMute(guild, mod, target, durationStr, reason);
    if (!c) {
      await i.editReply({ embeds: [errEmbed('Invalid duration. Use formats like: `10m`, `1h`, `7d` (max 28d).`')] });
      return;
    }
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /temptimeout ───────────────────────────────────────────────────────

  private async cmdTempTimeout(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    return this.cmdMute(i, guild);
  }

  // ── /unmute ────────────────────────────────────────────────────────────

  private async cmdUnmute(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    if (!target) { await i.editReply({ embeds: [errEmbed('User not found in this server.')] }); return; }

    const perm = await checkModPermission(mod, target, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const reason = i.options.getString('reason') ?? '';
    const c = await execUnmute(guild, mod, target, reason);
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /kick ──────────────────────────────────────────────────────────────

  private async cmdKick(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    if (!target) { await i.editReply({ embeds: [errEmbed('User not found in this server.')] }); return; }

    const perm = await checkModPermission(mod, target, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const reason = i.options.getString('reason') ?? '';
    const c = await execKick(guild, mod, target, reason);
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /ban ───────────────────────────────────────────────────────────────

  private async cmdBan(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    const targetUser = target?.user ?? i.options.getUser('user', true);

    const perm = await checkModPermission(mod, target ?? targetUser, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const reason     = i.options.getString('reason') ?? '';
    const deleteDays = Math.max(0, Math.min(7, i.options.getInteger('delete_days') ?? 0));

    const c = await execBan(guild, mod, target ?? targetUser, reason, deleteDays);
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /tempban ───────────────────────────────────────────────────────────

  private async cmdTempBan(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    const targetUser = target?.user ?? i.options.getUser('user', true);

    const perm = await checkModPermission(mod, target ?? targetUser, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const durationStr = i.options.getString('duration', true);
    const reason      = i.options.getString('reason') ?? '';

    const c = await execTempBan(guild, mod, target ?? targetUser, durationStr, reason);
    if (!c) {
      await i.editReply({ embeds: [errEmbed('Invalid duration. Use formats like: `1h`, `7d`, `2w`.')] });
      return;
    }
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /unban ─────────────────────────────────────────────────────────────

  private async cmdUnban(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const userId = i.options.getString('user_id', true).trim();
    const reason = i.options.getString('reason') ?? '';

    try {
      const c = await execUnban(guild, mod, userId, reason);
      await i.editReply({ embeds: [buildCaseEmbed(c)] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not unban user.';
      await i.editReply({ embeds: [errEmbed(`❌ ${msg}`)] });
    }
  }

  // ── /softban ───────────────────────────────────────────────────────────

  private async cmdSoftBan(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    if (!target) { await i.editReply({ embeds: [errEmbed('User not found in this server.')] }); return; }

    const perm = await checkModPermission(mod, target, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const reason = i.options.getString('reason') ?? '';
    const c = await execSoftBan(guild, mod, target, reason);
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /purge ─────────────────────────────────────────────────────────────

  private async cmdPurge(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const amount    = Math.max(1, Math.min(100, i.options.getInteger('amount', true)));
    const filterUser = i.options.getUser('user');
    const channel   = (i.options.getChannel('channel') ?? i.channel) as TextChannel | null;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await i.editReply({ embeds: [errEmbed('Can only purge in text channels.')] });
      return;
    }

    const deleted = await execPurge(guild, mod, channel, amount, filterUser?.id);
    await i.editReply({ embeds: [okEmbed(`🗑️ Deleted **${deleted}** message(s) from <#${channel.id}>.`)] });
  }

  // ── /slowmode ──────────────────────────────────────────────────────────

  private async cmdSlowmode(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const seconds = Math.max(0, Math.min(21600, i.options.getInteger('seconds', true)));
    const channel = (i.options.getChannel('channel') ?? i.channel) as TextChannel | null;
    const reason  = i.options.getString('reason') ?? '';

    if (!channel || channel.type !== ChannelType.GuildText) {
      await i.editReply({ embeds: [errEmbed('Can only set slowmode in text channels.')] });
      return;
    }

    await execSlowmode(guild, mod, channel, seconds, reason);
    const msg = seconds === 0
      ? `🔊 Slowmode **disabled** in <#${channel.id}>.`
      : `🐢 Slowmode set to **${seconds}s** in <#${channel.id}>.`;
    await i.editReply({ embeds: [okEmbed(msg, 0x5865f2)] });
  }

  // ── /nick ──────────────────────────────────────────────────────────────

  private async cmdNick(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    if (!target) { await i.editReply({ embeds: [errEmbed('User not found in this server.')] }); return; }

    const perm = await checkModPermission(mod, target, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const nickname = i.options.getString('nickname');
    const reason   = i.options.getString('reason') ?? '';
    const c = await execNick(guild, mod, target, nickname, reason);
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /lock ──────────────────────────────────────────────────────────────

  private async cmdLock(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const channel = (i.options.getChannel('channel') ?? i.channel) as TextChannel | null;
    const reason  = i.options.getString('reason') ?? '';

    if (!channel || channel.type !== ChannelType.GuildText) {
      await i.editReply({ embeds: [errEmbed('Can only lock text channels.')] });
      return;
    }

    await execLock(guild, mod, channel, reason);
    await i.editReply({ embeds: [okEmbed(`🔒 <#${channel.id}> has been **locked**. Members cannot send messages.`, 0xf5a623)] });
  }

  // ── /unlock ────────────────────────────────────────────────────────────

  private async cmdUnlock(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const channel = (i.options.getChannel('channel') ?? i.channel) as TextChannel | null;
    const reason  = i.options.getString('reason') ?? '';

    if (!channel || channel.type !== ChannelType.GuildText) {
      await i.editReply({ embeds: [errEmbed('Can only unlock text channels.')] });
      return;
    }

    await execUnlock(guild, mod, channel, reason);
    await i.editReply({ embeds: [okEmbed(`🔓 <#${channel.id}> has been **unlocked**. Members can send messages again.`)] });
  }

  // ── /role ──────────────────────────────────────────────────────────────

  private async cmdRole(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const target = i.options.getMember('user') as GuildMember | null;
    if (!target) { await i.editReply({ embeds: [errEmbed('User not found in this server.')] }); return; }

    const perm = await checkModPermission(mod, target, guild);
    if (!perm.ok) { await i.editReply({ embeds: [errEmbed(perm.reason!)] }); return; }

    const action = i.options.getString('action', true) as 'add' | 'remove';
    const role   = i.options.getRole('role', true) as import('discord.js').Role;
    const reason = i.options.getString('reason') ?? '';

    // Hierarchy check for the role itself
    const modTop  = mod.roles.highest.position;
    const rolePos = role.position;
    if (rolePos >= modTop) {
      await i.editReply({ embeds: [errEmbed('You cannot assign/remove a role equal to or higher than your highest role.')] });
      return;
    }

    const c = await execRoleChange(guild, mod, target, role, action, reason);
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /case ──────────────────────────────────────────────────────────────

  private async cmdCase(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const caseId = i.options.getString('id', true).toUpperCase();
    const c = await getCase(guild.id, caseId);
    if (!c) {
      await i.editReply({ embeds: [errEmbed(`Case \`${caseId}\` not found.`)] });
      return;
    }
    await i.editReply({ embeds: [buildCaseEmbed(c)] });
  }

  // ── /history ───────────────────────────────────────────────────────────

  private async cmdHistory(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const user = i.options.getUser('user', true);
    const page = Math.max(0, (i.options.getInteger('page') ?? 1) - 1);

    const result = await getHistory(guild, user.id, page);

    const prevRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`_hist_prev_${user.id}_${page}`)
        .setLabel('← Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`_hist_next_${user.id}_${page}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= result.totalPages - 1),
    );

    await i.editReply({
      embeds: [result.embed],
      components: result.totalPages > 1 ? [prevRow] : [],
    });
  }

  // ── /editcase ──────────────────────────────────────────────────────────

  private async cmdEditCase(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    const caseId = i.options.getString('id', true).toUpperCase();
    const reason = i.options.getString('reason', true);

    const updated = await editCaseReason(guild.id, caseId, reason);
    if (!updated) {
      await i.editReply({ embeds: [errEmbed(`Case \`${caseId}\` not found.`)] });
      return;
    }
    await i.editReply({ embeds: [buildCaseEmbed(updated)] });
  }

  // ── /deletecase ────────────────────────────────────────────────────────

  private async cmdDeleteCase(i: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const mod = await assertMod(i, guild);
    if (!mod) return;

    // Only admins can delete cases
    if (!mod.permissions.has(0x8n)) { // Administrator
      await i.editReply({ embeds: [errEmbed('Only administrators can delete cases.')] });
      return;
    }

    const caseId = i.options.getString('id', true).toUpperCase();
    const success = await deleteCase(guild.id, caseId);
    if (!success) {
      await i.editReply({ embeds: [errEmbed(`Case \`${caseId}\` not found.`)] });
      return;
    }
    await i.editReply({ embeds: [okEmbed(`🗑️ Case \`${caseId}\` has been permanently deleted.`, 0xed4245)] });
  }
}

export const moderationHandler = new ModerationCommandHandler();
