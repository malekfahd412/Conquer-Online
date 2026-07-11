import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
  type Guild,
  type ButtonInteraction,
  type GuildTextBasedChannel,
  type TextChannel,
} from 'discord.js';
import {
  updatePanelMessage,
  getPanel,
  getPanels,
  deletePanel,
  createTicket,
  getTicket,
  getTicketByChannel,
  getOpenTicketsForUser,
  getTickets,
  updateTicket,
  nextTicketNumber,
  type TicketPanelConfig,
} from './ticket-store';
import { generateTranscript } from './ticket-transcript';
import { logger } from '../../utils/logger';

const STYLE_MAP: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

export class TicketService {
  buildPanelPayload(panel: TicketPanelConfig) {
    const embed = new EmbedBuilder()
      .setColor(panel.color)
      .setTitle(panel.title)
      .setDescription(panel.description);
    if (panel.footer) embed.setFooter({ text: panel.footer });
    if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);
    if (panel.banner) embed.setImage(panel.banner);

    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const b of panel.buttons) {
      const btn = new ButtonBuilder()
        .setCustomId(`tk:open:${panel.id}:${b.ticketType}`)
        .setLabel(b.label)
        .setStyle(STYLE_MAP[b.style] ?? ButtonStyle.Primary);
      if (b.emoji) btn.setEmoji(b.emoji);
      row.addComponents(btn);
    }
    return { embeds: [embed], components: [row] };
  }

  async postPanel(guild: Guild, panel: TicketPanelConfig): Promise<void> {
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel?.isTextBased()) throw new Error('Ticket panel channel is not text-based');
    const message = await (channel as TextChannel).send(this.buildPanelPayload(panel));
    await updatePanelMessage(panel.id, message.id);
  }

  async openTicket(interaction: ButtonInteraction, guild: Guild, panelId: string, ticketType: string): Promise<void> {
    const panel = await getPanel(panelId);
    if (!panel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }

    const blocked = interaction.member && 'roles' in interaction.member
      ? (interaction.member.roles as any).cache?.some((r: { id: string }) => panel.blockedRoleIds.includes(r.id))
      : false;
    if (blocked) {
      await interaction.reply({ content: '❌ You are not permitted to open tickets on this panel.', ephemeral: true });
      return;
    }

    if (panel.allowedRoleIds.length > 0) {
      const allowed = interaction.member && 'roles' in interaction.member
        ? (interaction.member.roles as any).cache?.some((r: { id: string }) => panel.allowedRoleIds.includes(r.id))
        : false;
      if (!allowed) {
        await interaction.reply({ content: '❌ You do not have a role permitted to open tickets here.', ephemeral: true });
        return;
      }
    }

    const openCount = (await getOpenTicketsForUser(guild.id, interaction.user.id)).length;
    if (openCount >= panel.maxTicketsPerUser) {
      await interaction.reply({ content: `❌ You already have ${openCount} open ticket(s) (limit: ${panel.maxTicketsPerUser}).`, ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const number = await nextTicketNumber(guild.id);
    const name = panel.namingFormat
      .replace('{number}', String(number).padStart(4, '0'))
      .replace('{username}', interaction.user.username)
      .replace('{type}', ticketType)
      .slice(0, 90);

    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      ...panel.supportRoleIds.map(roleId => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] })),
    ];

    const channel = await guild.channels.create({
      name,
      parent: panel.categoryId,
      permissionOverwrites: overwrites,
      topic: `Ticket for ${interaction.user.tag} • Type: ${ticketType} • Panel: ${panel.id}`,
    });

    const ticket = await createTicket({
      guildId: guild.id,
      panelId: panel.id,
      ticketType,
      channelId: channel.id,
      openerId: interaction.user.id,
      number,
    });

    const embed = new EmbedBuilder()
      .setColor(panel.color)
      .setTitle(`🎫 ${ticketType} — Ticket #${number}`)
      .setDescription(`Welcome ${interaction.user}, support will be with you shortly.\n\nUse the buttons below to manage this ticket.`)
      .setFooter({ text: `Ticket ID: ${ticket.id}` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tk:claim:${ticket.id}`).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
      new ButtonBuilder().setCustomId(`tk:close:${ticket.id}`).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId(`tk:transcript:${ticket.id}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );

    const pingRoles = panel.supportRoleIds.map(id => `<@&${id}>`).join(' ');
    await (channel as TextChannel).send({ content: pingRoles || undefined, embeds: [embed], components: [row] });

    if (panel.logChannelId) {
      await this.logAction(guild, panel.logChannelId, `🎫 Ticket **#${number}** opened by ${interaction.user.tag} in ${channel} (type: ${ticketType})`);
    }

    await interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });
  }

  async claim(interaction: ButtonInteraction, _guild: Guild, ticketId: string, claim: boolean): Promise<void> {
    const ticket = await getTicket(ticketId);
    if (!ticket) { await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true }); return; }
    await updateTicket(ticketId, { claimedBy: claim ? interaction.user.id : undefined, firstStaffReplyAt: ticket.firstStaffReplyAt ?? (claim ? Date.now() : undefined) });
    await interaction.reply({ content: claim ? `🙋 ${interaction.user} claimed this ticket.` : `↩️ ${interaction.user} unclaimed this ticket.` });
  }

  async close(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await getTicket(ticketId);
    if (!ticket) { await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true }); return; }
    const panel = await getPanel(ticket.panelId);
    await interaction.deferUpdate();

    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const transcript = await generateTranscript(channel as GuildTextBasedChannel);
      if (panel?.transcriptChannelId) {
        const tc = await guild.channels.fetch(panel.transcriptChannelId).catch(() => null);
        if (tc?.isTextBased()) {
          const file = new AttachmentBuilder(Buffer.from(transcript.html, 'utf-8'), { name: `ticket-${ticket.number}.html` });
          await (tc as TextChannel).send({ content: `📄 Transcript for ticket #${ticket.number} (closed by ${interaction.user.tag})`, files: [file] });
        }
      }
      await (channel as TextChannel).permissionOverwrites.edit(ticket.openerId, { SendMessages: false }).catch(() => {});
      if (panel?.archiveCategoryId) {
        await (channel as TextChannel).setParent(panel.archiveCategoryId, { lockPermissions: false }).catch(() => {});
      }
    }

    await updateTicket(ticketId, { status: 'closed', closedAt: Date.now(), closedBy: interaction.user.id });

    if (panel?.logChannelId) {
      await this.logAction(guild, panel.logChannelId, `🔒 Ticket **#${ticket.number}** closed by ${interaction.user.tag}`);
    }

    const embed = new EmbedBuilder().setColor(0xed4245).setDescription(`🔒 Ticket closed by ${interaction.user}.`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tk:reopen:${ticket.id}`).setLabel('Reopen').setStyle(ButtonStyle.Success).setEmoji('🔓'),
      new ButtonBuilder().setCustomId(`tk:delete:${ticket.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`tk:transcript:${ticket.id}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );
    await interaction.editReply({ embeds: [embed], components: [row] }).catch(() => {});
    if (channel?.isTextBased()) await (channel as TextChannel).send({ embeds: [embed], components: [row] }).catch(() => {});

    if (panel?.autoDelete && channel) {
      setTimeout(() => { channel.delete().catch(() => {}); }, 10_000);
    }
  }

  async reopen(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await getTicket(ticketId);
    if (!ticket) { await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true }); return; }
    await updateTicket(ticketId, { status: 'open', closedAt: undefined, closedBy: undefined });
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await (channel as TextChannel).permissionOverwrites.edit(ticket.openerId, { SendMessages: true }).catch(() => {});
    }
    await interaction.reply({ content: `🔓 Ticket reopened by ${interaction.user}.` });
  }

  async deleteTicketChannel(interaction: ButtonInteraction, guild: Guild, _ticketId: string): Promise<void> {
    await interaction.reply({ content: '🗑️ Deleting ticket channel in 5 seconds...' });
    setTimeout(async () => {
      const channel = await guild.channels.fetch(interaction.channelId).catch(() => null);
      await channel?.delete().catch(() => {});
    }, 5000);
  }

  async sendTranscript(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await getTicket(ticketId);
    if (!ticket) { await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true }); return; }
    await interaction.deferReply({ ephemeral: true });
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.isTextBased()) { await interaction.editReply('❌ Ticket channel not found.'); return; }
    const transcript = await generateTranscript(channel as GuildTextBasedChannel);
    const file = new AttachmentBuilder(Buffer.from(transcript.html, 'utf-8'), { name: `ticket-${ticket.number}.html` });
    await interaction.editReply({ content: `📄 Transcript generated (${transcript.messageCount} messages).`, files: [file] });
  }

  private async logAction(guild: Guild, logChannelId: string, message: string): Promise<void> {
    const ch = await guild.channels.fetch(logChannelId).catch(() => null);
    if (ch?.isTextBased()) await (ch as TextChannel).send(message).catch(() => {});
  }

  async dashboardStats(guildId: string) {
    const tickets = await getTickets(guildId);
    const open = tickets.filter(t => t.status === 'open');
    const closed = tickets.filter(t => t.status === 'closed');
    const responseTimes = tickets.filter(t => t.firstStaffReplyAt).map(t => t.firstStaffReplyAt! - t.createdAt);
    const avgResponseMs = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

    const claimCounts = new Map<string, number>();
    for (const t of tickets) {
      if (t.claimedBy) claimCounts.set(t.claimedBy, (claimCounts.get(t.claimedBy) ?? 0) + 1);
    }
    const leaderboard = Array.from(claimCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return { total: tickets.length, open: open.length, closed: closed.length, avgResponseMs, leaderboard };
  }

  async handleInteraction(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const [, action, a, b] = interaction.customId.split(':');
    try {
      switch (action) {
        case 'open': await this.openTicket(interaction, guild, a, b); break;
        case 'claim': await this.claim(interaction, guild, a, true); break;
        case 'unclaim': await this.claim(interaction, guild, a, false); break;
        case 'close': await this.close(interaction, guild, a); break;
        case 'reopen': await this.reopen(interaction, guild, a); break;
        case 'delete': await this.deleteTicketChannel(interaction, guild, a); break;
        case 'transcript': await this.sendTranscript(interaction, guild, a); break;
        default:
          await interaction.reply({ content: '❌ Unknown ticket action.', ephemeral: true });
      }
    } catch (err) {
      logger.error('Ticket interaction error', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ An error occurred processing this ticket action.' }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ An error occurred processing this ticket action.', ephemeral: true }).catch(() => {});
      }
    }
  }
}

export const ticketService = new TicketService();
export { getPanels, deletePanel, getPanel, getTicketByChannel };
