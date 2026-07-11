import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import {
  getVerificationPanel,
  updateVerificationPanelMessage,
  upsertAttempt,
  incrementFail,
  getAttempt,
  getAttempts,
  type VerificationPanelConfig,
} from './verification-store';
import { logger } from '../../utils/logger';

const EMOJI_SET = ['🍎', '🍌', '🍇', '🍉', '🍒', '🍋', '🍓', '🥝'];

export class VerificationService {
  buildPanelPayload(panel: VerificationPanelConfig) {
    const embed = new EmbedBuilder()
      .setColor(panel.color)
      .setTitle(panel.title)
      .setDescription(panel.description)
      .setFooter({ text: `Method: ${panel.method}` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`vf:start:${panel.id}`)
        .setLabel(panel.method === 'rules' ? 'Accept Rules' : 'Verify')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
    );
    return { embeds: [embed], components: [row] };
  }

  async postPanel(guild: Guild, panel: VerificationPanelConfig): Promise<void> {
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel?.isTextBased()) throw new Error('Verification panel channel is not text-based');
    const message = await (channel as TextChannel).send(this.buildPanelPayload(panel));
    await updateVerificationPanelMessage(panel.id, message.id);
  }

  /**
   * Assigns the configured verified role (and adjusts unverified/welcome roles) for a member.
   * Returns true only if the verified role was actually confirmed present on the member afterwards.
   * Never silently swallows a role-assignment failure — callers MUST check the return value
   * before treating the user as verified.
   */
  private async grantVerified(guild: Guild, panel: VerificationPanelConfig, userId: string): Promise<boolean> {
    logger.info(`[VERIFY] guild=${guild.id} panel=${panel.id} method=${panel.method} user=${userId} verifiedRoleId=${panel.verifiedRoleId} unverifiedRoleId=${panel.unverifiedRoleId ?? 'none'} welcomeRoleId=${panel.welcomeRoleId ?? 'none'}`);

    const member = await guild.members.fetch(userId).catch((err) => {
      logger.error(`[VERIFY] Failed to fetch member ${userId} in guild ${guild.id}`, err);
      return null;
    });
    if (!member) {
      logger.error(`[VERIFY] Aborting: member ${userId} could not be fetched (left guild? cache issue?)`);
      return false;
    }

    if (!panel.verifiedRoleId) {
      logger.error(`[VERIFY] Panel ${panel.id} has no verifiedRoleId configured — nothing to assign`);
      return false;
    }

    const role = await guild.roles.fetch(panel.verifiedRoleId).catch((err) => {
      logger.error(`[VERIFY] Failed to fetch role ${panel.verifiedRoleId}`, err);
      return null;
    });
    const botMember = guild.members.me;
    const botHighest = botMember?.roles.highest;

    logger.info(
      `[VERIFY] Role check — id=${panel.verifiedRoleId} exists=${!!role} name=${role?.name ?? 'n/a'} `
      + `position=${role?.position ?? 'n/a'} managed=${role?.managed ?? 'n/a'} `
      + `botHighestRole=${botHighest?.name ?? 'n/a'}(pos=${botHighest?.position ?? 'n/a'}) `
      + `canManageRoles=${botMember?.permissions.has('ManageRoles') ?? false} `
      + `isOwner=${guild.ownerId === botMember?.id} `
      + `memberAlreadyHasRole=${role ? member.roles.cache.has(role.id) : 'n/a'}`,
    );

    if (!role) {
      logger.error(`[VERIFY] Aborting: verifiedRoleId ${panel.verifiedRoleId} does not exist in guild ${guild.id} (deleted role?)`);
      return false;
    }
    if (role.managed) {
      logger.error(`[VERIFY] Aborting: role ${role.name} (${role.id}) is managed by an integration and cannot be manually assigned`);
      return false;
    }
    if (!botMember?.permissions.has('ManageRoles')) {
      logger.error(`[VERIFY] Aborting: bot is missing the "Manage Roles" permission in guild ${guild.id}`);
      return false;
    }
    if (!botHighest || botHighest.position <= role.position) {
      logger.error(
        `[VERIFY] Aborting: role hierarchy blocks assignment — bot's highest role `
        + `"${botHighest?.name}" (pos ${botHighest?.position}) is not above "${role.name}" (pos ${role.position}). `
        + `Move the bot's role above the verified role in Server Settings → Roles.`,
      );
      return false;
    }

    try {
      await member.roles.add(role);
      logger.success(`[VERIFY] Role ${role.name} (${role.id}) assigned to ${member.user.tag}`);
    } catch (err) {
      logger.error(`[VERIFY] member.roles.add() threw for ${member.user.tag} / role ${role.id}`, err);
      return false;
    }

    // Re-fetch to confirm the role actually stuck (belt-and-suspenders against cache drift).
    const confirmed = member.roles.cache.has(role.id);
    if (!confirmed) {
      logger.error(`[VERIFY] Role add() resolved without throwing but role ${role.id} is not present on member ${member.id} after assignment`);
      return false;
    }

    if (panel.unverifiedRoleId) {
      try {
        await member.roles.remove(panel.unverifiedRoleId);
      } catch (err) {
        logger.warning(`[VERIFY] Failed to remove unverifiedRoleId ${panel.unverifiedRoleId} from ${member.user.tag} (non-fatal, verification still counts)`, err);
      }
    }
    if (panel.welcomeRoleId) {
      try {
        await member.roles.add(panel.welcomeRoleId);
      } catch (err) {
        logger.warning(`[VERIFY] Failed to add welcomeRoleId ${panel.welcomeRoleId} to ${member.user.tag} (non-fatal, verification still counts)`, err);
      }
    }

    await upsertAttempt({ guildId: guild.id, panelId: panel.id, userId, status: 'verified', method: panel.method });
    if (panel.logChannelId) await this.log(guild, panel.logChannelId, `✅ ${member.user.tag} verified via **${panel.method}**`);
    return true;
  }

  private async reject(guild: Guild, panel: VerificationPanelConfig, userId: string, reason: string): Promise<void> {
    await upsertAttempt({ guildId: guild.id, panelId: panel.id, userId, status: 'rejected', method: panel.method });
    if (panel.logChannelId) await this.log(guild, panel.logChannelId, `❌ <@${userId}> failed verification: ${reason}`);
  }

  private async log(guild: Guild, logChannelId: string, message: string): Promise<void> {
    const ch = await guild.channels.fetch(logChannelId).catch(() => null);
    if (ch?.isTextBased()) await (ch as TextChannel).send(message).catch(() => {});
  }

  private checkCooldown(attempt: { lastAttemptAt: number } | undefined, cooldownSeconds: number): number {
    if (!attempt || cooldownSeconds <= 0) return 0;
    const elapsed = (Date.now() - attempt.lastAttemptAt) / 1000;
    return elapsed < cooldownSeconds ? Math.ceil(cooldownSeconds - elapsed) : 0;
  }

  async startVerification(interaction: ButtonInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await getVerificationPanel(panelId);
    if (!panel) { await interaction.reply({ content: '❌ This verification panel no longer exists.', ephemeral: true }); return; }

    const existingAttempt = await getAttempt(guild.id, panelId, interaction.user.id);
    if (existingAttempt?.status === 'verified') {
      await interaction.reply({ content: '✅ You are already verified.', ephemeral: true });
      return;
    }
    const cooldown = this.checkCooldown(existingAttempt, panel.cooldownSeconds);
    if (cooldown > 0) {
      await interaction.reply({ content: `⏳ Please wait ${cooldown}s before trying again.`, ephemeral: true });
      return;
    }

    if (panel.minAccountAgeDays > 0) {
      const accountAgeDays = (Date.now() - interaction.user.createdTimestamp) / 86_400_000;
      if (accountAgeDays < panel.minAccountAgeDays) {
        await interaction.reply({ content: `❌ Your Discord account must be at least ${panel.minAccountAgeDays} day(s) old to verify.`, ephemeral: true });
        await this.reject(guild, panel, interaction.user.id, 'account too new');
        return;
      }
    }

    switch (panel.method) {
      case 'button':
      case 'rules': {
        await interaction.deferReply({ ephemeral: true });
        const granted = await this.grantVerified(guild, panel, interaction.user.id);
        if (granted) {
          await interaction.editReply({ content: '✅ You have been verified! Welcome.' });
        } else {
          await interaction.editReply({ content: '❌ Verification succeeded but the role could not be assigned. Please contact a staff member — this has been logged.' });
        }
        return;
      }

      case 'math': {
        const a = 1 + Math.floor(Math.random() * 20);
        const b = 1 + Math.floor(Math.random() * 20);
        const modal = new ModalBuilder().setCustomId(`vf:m:math:${panel.id}:${a}:${b}`).setTitle('Verification — Math Question');
        const input = new TextInputBuilder().setCustomId('answer').setLabel(`What is ${a} + ${b}?`).setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await interaction.showModal(modal);
        return;
      }

      case 'word': {
        const words = ['DISCORD', 'MUFASA', 'VERIFY', 'CONQUER'];
        const word = words[Math.floor(Math.random() * words.length)];
        const modal = new ModalBuilder().setCustomId(`vf:m:word:${panel.id}:${word}`).setTitle('Verification — Word Check');
        const input = new TextInputBuilder().setCustomId('answer').setLabel(`Type the word: ${word}`).setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await interaction.showModal(modal);
        return;
      }

      case 'emoji': {
        const shuffled = [...EMOJI_SET].sort(() => Math.random() - 0.5).slice(0, 4);
        const correct = shuffled[Math.floor(Math.random() * shuffled.length)];
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          shuffled.map(e => new ButtonBuilder().setCustomId(`vf:e:${panel.id}:${e === correct ? 'y' : 'n'}`).setEmoji(e).setStyle(ButtonStyle.Secondary)),
        );
        await interaction.reply({ content: `🧩 Click **${correct}** to verify:`, components: [row], ephemeral: true });
        return;
      }

      case 'manual': {
        await interaction.deferReply({ ephemeral: true });
        await upsertAttempt({ guildId: guild.id, panelId: panel.id, userId: interaction.user.id, status: 'pending', method: panel.method });
        if (panel.logChannelId) {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`vf:approve:${panel.id}:${interaction.user.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`vf:decline:${panel.id}:${interaction.user.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
          );
          await this.logWithComponents(guild, panel.logChannelId, `📋 Manual verification requested by <@${interaction.user.id}> (${interaction.user.tag})`, [row]);
        }
        await interaction.editReply({ content: '📋 Your verification request has been sent to staff for review.' });
        return;
      }
    }
  }

  private async logWithComponents(guild: Guild, logChannelId: string, content: string, components: ActionRowBuilder<ButtonBuilder>[]): Promise<void> {
    const ch = await guild.channels.fetch(logChannelId).catch(() => null);
    if (ch?.isTextBased()) await (ch as TextChannel).send({ content, components }).catch(() => {});
  }

  async handleModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const parts = interaction.customId.split(':');
    const [, , kind, panelId] = parts;
    const panel = await getVerificationPanel(panelId);
    if (!panel) { await interaction.reply({ content: '❌ Panel no longer exists.', ephemeral: true }); return; }

    await interaction.deferReply({ ephemeral: true });
    const answer = interaction.fields.getTextInputValue('answer').trim();

    let correct = false;
    if (kind === 'math') {
      const a = Number(parts[4]); const b = Number(parts[5]);
      correct = Number(answer) === a + b;
    } else if (kind === 'word') {
      const expected = parts[4];
      correct = answer.toUpperCase() === expected;
    }

    if (correct) {
      const granted = await this.grantVerified(guild, panel, interaction.user.id);
      if (granted) {
        await interaction.editReply({ content: '✅ Verified successfully! Welcome.' });
      } else {
        await interaction.editReply({ content: '❌ Verification succeeded but the role could not be assigned. Please contact a staff member — this has been logged.' });
      }
    } else {
      const attempt = await getAttempt(guild.id, panel.id, interaction.user.id);
      const fails = attempt ? await incrementFail(attempt.id) : 0;
      await upsertAttempt({ guildId: guild.id, panelId: panel.id, userId: interaction.user.id, status: 'pending', method: panel.method, failCount: fails + 1 });
      await interaction.editReply({ content: '❌ Incorrect answer. Click the verify button to try again.' });
    }
  }

  async handleEmojiClick(interaction: ButtonInteraction, guild: Guild, panelId: string, isCorrect: boolean): Promise<void> {
    const panel = await getVerificationPanel(panelId);
    if (!panel) { await interaction.reply({ content: '❌ Panel no longer exists.', ephemeral: true }); return; }
    await interaction.deferUpdate();
    if (isCorrect) {
      const granted = await this.grantVerified(guild, panel, interaction.user.id);
      if (granted) {
        await interaction.editReply({ content: '✅ Verified successfully! Welcome.', components: [] });
      } else {
        await interaction.editReply({ content: '❌ Verification succeeded but the role could not be assigned. Please contact a staff member — this has been logged.', components: [] });
      }
    } else {
      await interaction.editReply({ content: '❌ Wrong emoji. Click the verify button to try again.', components: [] });
    }
  }

  async approveManual(interaction: ButtonInteraction, guild: Guild, panelId: string, userId: string, approve: boolean): Promise<void> {
    const panel = await getVerificationPanel(panelId);
    if (!panel) { await interaction.reply({ content: '❌ Panel no longer exists.', ephemeral: true }); return; }
    await interaction.deferUpdate();
    if (approve) {
      const granted = await this.grantVerified(guild, panel, userId);
      if (granted) {
        await interaction.editReply({ content: `✅ <@${userId}> approved by ${interaction.user}.`, components: [] });
      } else {
        await interaction.editReply({ content: `❌ <@${userId}> approved by ${interaction.user}, but the role could not be assigned. This has been logged — check bot permissions/role hierarchy.`, components: [] });
      }
    } else {
      await this.reject(guild, panel, userId, `manually rejected by ${interaction.user.tag}`);
      await interaction.editReply({ content: `❌ <@${userId}> rejected by ${interaction.user}.`, components: [] });
    }
  }

  async handleInteraction(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const [, action, a, b] = interaction.customId.split(':');
    try {
      switch (action) {
        case 'start': await this.startVerification(interaction, guild, a); break;
        case 'e': await this.handleEmojiClick(interaction, guild, a, b === 'y'); break;
        case 'approve': await this.approveManual(interaction, guild, a, b, true); break;
        case 'decline': await this.approveManual(interaction, guild, a, b, false); break;
        default: await interaction.reply({ content: '❌ Unknown verification action.', ephemeral: true });
      }
    } catch (err) {
      logger.error('Verification interaction error', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ An error occurred during verification.' }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ An error occurred during verification.', ephemeral: true }).catch(() => {});
      }
    }
  }

  async dashboardStats(guildId: string) {
    const [pending, verified, rejected] = await Promise.all([
      getAttempts(guildId, 'pending'),
      getAttempts(guildId, 'verified'),
      getAttempts(guildId, 'rejected'),
    ]);
    return { pending: pending.length, verified: verified.length, rejected: rejected.length };
  }
}

export const verificationService = new VerificationService();
