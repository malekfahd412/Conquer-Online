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
  getApplicationPanel,
  updateApplicationPanelMessage,
  createSubmission,
  getSubmission,
  getLastSubmission,
  updateSubmission,
  getSubmissions,
  type ApplicationPanelConfig,
} from './application-store';
import { logger } from '../../utils/logger';

export class ApplicationService {
  buildPanelPayload(panel: ApplicationPanelConfig) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(panel.title)
      .setDescription(panel.description)
      .setFooter({ text: `Applying for: ${panel.roleName}` });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ap:start:${panel.id}`).setLabel(panel.buttonLabel).setStyle(ButtonStyle.Primary).setEmoji('📨'),
    );
    return { embeds: [embed], components: [row] };
  }

  async postPanel(guild: Guild, panel: ApplicationPanelConfig): Promise<void> {
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel?.isTextBased()) throw new Error('Application panel channel is not text-based');
    const message = await (channel as TextChannel).send(this.buildPanelPayload(panel));
    await updateApplicationPanelMessage(panel.id, message.id);
  }

  async startApplication(interaction: ButtonInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await getApplicationPanel(panelId);
    if (!panel) { await interaction.reply({ content: '❌ This application panel no longer exists.', ephemeral: true }); return; }

    if (panel.cooldownHours > 0) {
      const last = await getLastSubmission(guild.id, panelId, interaction.user.id);
      if (last) {
        const hoursSince = (Date.now() - last.createdAt) / 3_600_000;
        if (last.status === 'pending') {
          await interaction.reply({ content: '❌ You already have a pending application for this role.', ephemeral: true });
          return;
        }
        if (hoursSince < panel.cooldownHours) {
          await interaction.reply({ content: `❌ You must wait ${Math.ceil(panel.cooldownHours - hoursSince)}h before reapplying.`, ephemeral: true });
          return;
        }
      }
    }

    const modal = new ModalBuilder().setCustomId(`ap:m:${panel.id}`).setTitle(panel.title.slice(0, 45));
    for (const q of panel.questions.slice(0, 5)) {
      const input = new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.label.slice(0, 45))
        .setStyle(q.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(q.required);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }
    await interaction.showModal(modal);
  }

  async handleModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const panelId = interaction.customId.split(':')[2];
    const panel = await getApplicationPanel(panelId);
    if (!panel) { await interaction.reply({ content: '❌ Panel no longer exists.', ephemeral: true }); return; }

    await interaction.deferReply({ ephemeral: true });

    const answers: Record<string, string> = {};
    for (const q of panel.questions.slice(0, 5)) {
      answers[q.id] = interaction.fields.getTextInputValue(q.id) || '';
    }

    const submission = await createSubmission({ guildId: guild.id, panelId, applicantId: interaction.user.id, answers });

    if (panel.reviewChannelId) {
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`📨 New Application — ${panel.roleName}`)
        .setDescription(`Applicant: ${interaction.user} (${interaction.user.tag})`)
        .setFooter({ text: `Submission ID: ${submission.id}` });
      for (const q of panel.questions.slice(0, 5)) {
        embed.addFields({ name: q.label, value: (answers[q.id] || '_no answer_').slice(0, 1024) });
      }
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ap:accept:${submission.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ap:reject:${submission.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
      );
      const ch = await guild.channels.fetch(panel.reviewChannelId).catch(() => null);
      if (ch?.isTextBased()) await (ch as TextChannel).send({ embeds: [embed], components: [row] }).catch(() => {});
    }

    await interaction.editReply({ content: '✅ Your application has been submitted for review.' });
  }

  async review(interaction: ButtonInteraction, guild: Guild, submissionId: string, accept: boolean): Promise<void> {
    const submission = await getSubmission(submissionId);
    if (!submission) { await interaction.reply({ content: '❌ Submission not found.', ephemeral: true }); return; }
    const panel = await getApplicationPanel(submission.panelId);

    await interaction.deferUpdate();
    await updateSubmission(submissionId, { status: accept ? 'accepted' : 'rejected', reviewedBy: interaction.user.id, reviewedAt: Date.now() });

    if (accept && panel?.grantRoleId) {
      const member = await guild.members.fetch(submission.applicantId).catch(() => null);
      await member?.roles.add(panel.grantRoleId).catch(() => {});
    }

    const applicant = await guild.members.fetch(submission.applicantId).catch(() => null);
    const dmText = accept
      ? `🎉 Your application for **${panel?.roleName ?? 'a role'}** in **${guild.name}** was accepted!`
      : `Your application for **${panel?.roleName ?? 'a role'}** in **${guild.name}** was not accepted this time.`;
    await applicant?.send(dmText).catch(() => {});

    const statusEmbed = new EmbedBuilder()
      .setColor(accept ? 0x57f287 : 0xed4245)
      .setDescription(`${accept ? '✅ Accepted' : '❌ Rejected'} by ${interaction.user}`);
    await interaction.editReply({ embeds: [statusEmbed], components: [] }).catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const [, action, id] = interaction.customId.split(':');
    try {
      switch (action) {
        case 'start': await this.startApplication(interaction, guild, id); break;
        case 'accept': await this.review(interaction, guild, id, true); break;
        case 'reject': await this.review(interaction, guild, id, false); break;
        default: await interaction.reply({ content: '❌ Unknown application action.', ephemeral: true });
      }
    } catch (err) {
      logger.error('Application interaction error', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ An error occurred processing this application.' }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ An error occurred processing this application.', ephemeral: true }).catch(() => {});
      }
    }
  }

  async dashboardStats(guildId: string) {
    const [pending, accepted, rejected] = await Promise.all([
      getSubmissions(guildId, 'pending'),
      getSubmissions(guildId, 'accepted'),
      getSubmissions(guildId, 'rejected'),
    ]);
    return { pending: pending.length, accepted: accepted.length, rejected: rejected.length };
  }
}

export const applicationService = new ApplicationService();
