// ─────────────────────────────────────────────────────────────────────────────
// SLA Designer — Control Center page for Ticket SLA System Pro.
// Handles all sla:* custom-ID interactions. Accessible from the CC tickets
// category via the "📈 Ticket SLA" button.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type Interaction,
  type Guild,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { slaEngine, formatMs, computeSLAStatus, DEFAULT_SLA_TYPE_CONFIG, type SLATypeConfig } from '../../community/tickets/sla-engine';
import { panelManager } from '../../community/tickets/panel-manager';
import type { TicketPanel } from '../../community/tickets/types';
import { logger } from '../../utils/logger';

// ── Custom-ID namespace ───────────────────────────────────────────────────────

export function isSLAInteraction(customId: string): boolean {
  return customId.startsWith('sla:');
}

const SLA = {
  HOME:    'sla:home',
  TOGGLE:  'sla:toggle',
  PANELS:  'sla:panels',
  STATS:   'sla:stats',
  HISTORY: 'sla:history',
  config:  (panelId: string) => `sla:config:${panelId}`,
  editType: (panelId: string, typeKey: string) => `sla:edittype:${panelId}:${encodeType(typeKey)}`,
  modalType: (panelId: string, typeKey: string) => `sla:modal:type:${panelId}:${encodeType(typeKey)}`,
  CC_HOME: 'cc:home',
  CC_TICKETS: 'cc:cat:tickets',
} as const;

/** Encode ticket-type string safely for use inside a custom ID (max 40 chars). */
function encodeType(ticketType: string): string {
  return encodeURIComponent(ticketType).slice(0, 50);
}

function decodeType(encoded: string): string {
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all unique ticket-type strings from a panel (button + extra buttons + select options). */
function getPanelTicketTypes(panel: TicketPanel): string[] {
  const types = new Set<string>();
  types.add(panel.button.ticketType);
  for (const b of panel.additionalButtons) types.add(b.ticketType);
  for (const o of panel.selectMenu?.options ?? []) types.add(o.ticketType);
  return Array.from(types);
}

function statusEmoji(status: 'ok' | 'warning' | 'critical' | 'breached' | 'disabled'): string {
  const map: Record<string, string> = { ok: '✅', warning: '⚠️', critical: '🔴', breached: '🚨', disabled: '⚫' };
  return map[status] ?? '❓';
}

function formatMinutes(mins: number): string {
  if (mins <= 0) return '_disabled_';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function backRow(panelId?: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (panelId) {
    row.addComponents(
      new ButtonBuilder().setCustomId(SLA.config(panelId)).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId(SLA.PANELS).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(SLA.HOME).setLabel('📈 SLA Home').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(SLA.CC_TICKETS).setLabel('🎫 Tickets').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(SLA.CC_HOME).setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
  );
  return row;
}

// ── Designer class ────────────────────────────────────────────────────────────

export class SLADesigner {
  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    try {
      if (interaction.isButton()) {
        await this.routeButton(interaction, guild);
      } else if (interaction.isModalSubmit()) {
        await this.routeModal(interaction, guild);
      }
    } catch (err) {
      logger.error('[SLA] Interaction error', err);
      if (interaction.isRepliable()) {
        const payload = { content: '❌ An error occurred in the SLA Designer.', flags: MessageFlags.Ephemeral };
        if ((interaction as ButtonInteraction).deferred || (interaction as ButtonInteraction).replied) {
          await (interaction as ButtonInteraction).editReply(payload).catch(() => {});
        } else {
          await (interaction as ButtonInteraction).reply(payload).catch(() => {});
        }
      }
    }
  }

  // ── Routing ─────────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === SLA.HOME)    { await this.navHome(interaction, guild); return; }
    if (id === SLA.TOGGLE)  { await this.handleToggle(interaction, guild); return; }
    if (id === SLA.PANELS)  { await this.navPanels(interaction, guild); return; }
    if (id === SLA.STATS)   { await this.navStats(interaction, guild); return; }
    if (id === SLA.HISTORY) { await this.navHistory(interaction, guild); return; }

    const parts = id.split(':');
    if (parts[1] === 'config' && parts[2]) {
      await this.navPanelConfig(interaction, guild, parts[2]);
      return;
    }
    if (parts[1] === 'edittype' && parts[2] && parts[3]) {
      await this.navEditType(interaction, guild, parts[2], decodeType(parts.slice(3).join(':')));
      return;
    }
  }

  private async routeModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const parts = interaction.customId.split(':');
    // sla:modal:type:<panelId>:<encodedType>
    if (parts[1] === 'modal' && parts[2] === 'type' && parts[3] && parts[4]) {
      const panelId = parts[3];
      const ticketType = decodeType(parts.slice(4).join(':'));
      await this.handleSaveTypeConfig(interaction, guild, panelId, ticketType);
      return;
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  private async navHome(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.deferUpdate();
    const dash = await slaEngine.getDashboard(guild.id);
    const cfg = await slaEngine.getGuildConfig(guild.id);

    const statusLine = dash.enabled
      ? (dash.breached > 0 ? '🚨 Active SLA Breaches!' : dash.critical > 0 ? '🔴 Critical SLA Alerts' : dash.warned > 0 ? '⚠️ SLA Warnings Active' : '✅ All SLAs On Track')
      : '⚫ SLA Monitoring Disabled';

    const embed = new EmbedBuilder()
      .setColor(dash.enabled ? (dash.breached > 0 ? 0xed4245 : dash.critical > 0 ? 0xf5a623 : dash.warned > 0 ? 0xfee75c : 0x57f287) : 0x99aab5)
      .setTitle('📈 Ticket SLA System')
      .setDescription(statusLine)
      .addFields(
        { name: '📊 Tracking', value: `${dash.totalTracked} total · ${dash.open} open`, inline: true },
        { name: '🚨 Active Issues', value: `${statusEmoji('warning')} ${dash.warned} · ${statusEmoji('critical')} ${dash.critical} · ${statusEmoji('breached')} ${dash.breached}`, inline: true },
        { name: '✅ Compliance', value: `**${dash.complianceRate}%**`, inline: true },
        { name: '⏱ Avg First Response', value: dash.avgFirstResponseMs > 0 ? formatMs(dash.avgFirstResponseMs) : '_No data yet_', inline: true },
        { name: '⏱ Avg Resolution', value: dash.avgResolutionMs > 0 ? formatMs(dash.avgResolutionMs) : '_No data yet_', inline: true },
        { name: '🔧 Status', value: dash.enabled ? '**Enabled**' : '**Disabled**', inline: true },
      )
      .setFooter({ text: 'SLA System Pro • Configure per ticket type in each panel' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SLA.TOGGLE)
        .setLabel(dash.enabled ? '🔴 Disable SLA' : '✅ Enable SLA')
        .setStyle(dash.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(SLA.PANELS).setLabel('⚙️ Configure').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(SLA.STATS).setLabel('📊 Statistics').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SLA.HISTORY).setLabel('📜 History').setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SLA.CC_TICKETS).setLabel('🎫 Tickets').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SLA.CC_HOME).setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ content: '', embeds: [embed], components: [row1, row2] });
  }

  private async handleToggle(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.deferUpdate();
    const current = await slaEngine.getGuildConfig(guild.id);
    await slaEngine.setEnabled(guild.id, !current.enabled);
    logger.info(`[SLA] ${current.enabled ? 'Disabled' : 'Enabled'} for guild ${guild.id}`);
    await this.navHome(interaction, guild);
  }

  private async navPanels(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.deferUpdate();
    const panels = await panelManager.list(guild.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⚙️ SLA Configuration — Select Panel')
      .setDescription(
        panels.length > 0
          ? 'Choose a panel to configure SLA targets for its ticket types.'
          : '❌ No ticket panels found. Create a panel first via the **Ticket Panel Designer**.',
      );

    if (panels.length === 0) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(SLA.HOME).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(SLA.CC_HOME).setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({ content: '', embeds: [embed], components: [row] });
      return;
    }

    // Max 5 panels per row, max 4 rows for panels + 1 for back/home
    const panelButtons = panels.slice(0, 20).map(p =>
      new ButtonBuilder()
        .setCustomId(SLA.config(p.id))
        .setLabel(p.name.slice(0, 80))
        .setStyle(ButtonStyle.Primary),
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < panelButtons.length; i += 4) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(panelButtons.slice(i, i + 4)));
    }
    // Ensure we stay under Discord's 5-row limit
    if (rows.length > 4) rows.length = 4;

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SLA.HOME).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SLA.CC_HOME).setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
    );
    rows.push(navRow);

    await interaction.editReply({ content: '', embeds: [embed], components: rows });
  }

  private async navPanelConfig(interaction: ButtonInteraction, guild: Guild, panelId: string): Promise<void> {
    await interaction.deferUpdate();
    const panel = await panelManager.get(panelId);
    if (!panel) {
      await interaction.editReply({ content: '❌ Panel not found.', embeds: [], components: [] });
      return;
    }

    const ticketTypes = getPanelTicketTypes(panel);
    const cfg = await slaEngine.getGuildConfig(guild.id);

    const lines: string[] = [];
    for (const type of ticketTypes) {
      const tc = cfg.types[`${panelId}:${type}`];
      const frStr = tc ? formatMinutes(tc.firstResponseMinutes) : '_not set_';
      const resStr = tc ? formatMinutes(tc.resolutionMinutes) : '_not set_';
      lines.push(`**${type}** — FR: ${frStr} · Res: ${resStr}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⚙️ SLA — ${panel.name}`)
      .setDescription(
        `Configure SLA targets for each ticket type.\n**FR** = First Response · **Res** = Resolution\n\n${lines.join('\n') || '_No ticket types defined_'}`,
      )
      .setFooter({ text: 'Click a ticket type to configure its SLA targets' });

    const typeButtons = ticketTypes.slice(0, 20).map(type =>
      new ButtonBuilder()
        .setCustomId(SLA.editType(panelId, type))
        .setLabel(`✏️ ${type.slice(0, 60)}`)
        .setStyle(ButtonStyle.Primary),
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < typeButtons.length; i += 4) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(typeButtons.slice(i, i + 4)));
    }
    if (rows.length > 4) rows.length = 4;
    rows.push(backRow());

    await interaction.editReply({ content: '', embeds: [embed], components: rows });
  }

  private async navEditType(interaction: ButtonInteraction, guild: Guild, panelId: string, ticketType: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel) {
      await interaction.deferUpdate();
      await interaction.editReply({ content: '❌ Panel not found.', embeds: [], components: [] });
      return;
    }

    const existing = await slaEngine.getTypeConfig(guild.id, panelId, ticketType);
    const tc = existing ?? DEFAULT_SLA_TYPE_CONFIG;

    // Show modal for editing
    const modal = new ModalBuilder()
      .setCustomId(SLA.modalType(panelId, ticketType))
      .setTitle(`SLA — ${ticketType.slice(0, 30)}`);

    const frInput = new TextInputBuilder()
      .setCustomId('firstResponseMinutes')
      .setLabel('First Response Time (minutes, 0 = disabled)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(tc.firstResponseMinutes))
      .setRequired(true)
      .setPlaceholder('e.g. 10 (0 to disable)');

    const resInput = new TextInputBuilder()
      .setCustomId('resolutionMinutes')
      .setLabel('Resolution Time (minutes, 0 = disabled)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(tc.resolutionMinutes))
      .setRequired(true)
      .setPlaceholder('e.g. 60 (0 to disable)');

    const warnInput = new TextInputBuilder()
      .setCustomId('warningThresholdPercent')
      .setLabel('Warning Threshold % (e.g. 75)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(tc.warningThresholdPercent))
      .setRequired(true)
      .setPlaceholder('75');

    const critInput = new TextInputBuilder()
      .setCustomId('criticalThresholdPercent')
      .setLabel('Critical Threshold % (e.g. 90)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(tc.criticalThresholdPercent))
      .setRequired(true)
      .setPlaceholder('90');

    const notifyInput = new TextInputBuilder()
      .setCustomId('notifyConfig')
      .setLabel('Notify Channel ID, Manager Role IDs (comma sep)')
      .setStyle(TextInputStyle.Short)
      .setValue([tc.notifyChannelId ?? '', ...tc.managerRoleIds].filter(Boolean).join(', '))
      .setRequired(false)
      .setPlaceholder('channelId, roleId1, roleId2  (first is channel, rest are roles)');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(frInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(resInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(warnInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(critInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(notifyInput),
    );

    await interaction.showModal(modal);
  }

  private async handleSaveTypeConfig(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    panelId: string,
    ticketType: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parseNum = (fieldId: string, def: number): number => {
      try { const n = parseInt(interaction.fields.getTextInputValue(fieldId), 10); return isNaN(n) ? def : Math.max(0, n); }
      catch { return def; }
    };

    const firstResponseMinutes     = parseNum('firstResponseMinutes', 0);
    const resolutionMinutes        = parseNum('resolutionMinutes', 0);
    const warningThresholdPercent  = Math.min(99, Math.max(1, parseNum('warningThresholdPercent', 75)));
    const criticalThresholdPercent = Math.min(100, Math.max(warningThresholdPercent + 1, parseNum('criticalThresholdPercent', 90)));

    let notifyChannelId: string | undefined;
    let managerRoleIds: string[] = [];
    try {
      const raw = interaction.fields.getTextInputValue('notifyConfig').trim();
      if (raw) {
        const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
        if (parts[0]) notifyChannelId = parts[0];
        managerRoleIds = parts.slice(1);
      }
    } catch { /* optional field */ }

    const config: SLATypeConfig = {
      firstResponseMinutes,
      resolutionMinutes,
      warningThresholdPercent,
      criticalThresholdPercent,
      notifyChannelId,
      managerRoleIds,
    };

    await slaEngine.setTypeConfig(guild.id, panelId, ticketType, config);
    logger.info(`[SLA] Configured type "${ticketType}" in panel ${panelId} for guild ${guild.id}`);

    const frStr  = formatMinutes(firstResponseMinutes);
    const resStr = formatMinutes(resolutionMinutes);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ SLA Configuration Saved')
      .addFields(
        { name: '🏷️ Ticket Type', value: ticketType, inline: true },
        { name: '⏱ First Response', value: frStr, inline: true },
        { name: '⏱ Resolution', value: resStr, inline: true },
        { name: '⚠️ Warning at', value: `${warningThresholdPercent}%`, inline: true },
        { name: '🔴 Critical at', value: `${criticalThresholdPercent}%`, inline: true },
        { name: '📢 Notify Channel', value: notifyChannelId ? `<#${notifyChannelId}>` : '_none_', inline: true },
        { name: '👔 Manager Roles', value: managerRoleIds.length ? managerRoleIds.map(r => `<@&${r}>`).join(', ') : '_none_', inline: false },
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SLA.config(panelId)).setLabel('⬅️ Back to Panel').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SLA.HOME).setLabel('📈 SLA Home').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  }

  private async navStats(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.deferUpdate();
    const panels = await panelManager.list(guild.id);
    const openRecs = await slaEngine.getOpenRecords(guild.id);
    const history  = await slaEngine.getHistory(guild.id, 100);
    const closed   = history.filter(r => r.resolvedAt);

    // Per-type stats
    const typeStats: Record<string, { open: number; breached: number; frTimes: number[]; resTimes: number[] }> = {};
    for (const r of history) {
      const key = r.ticketType;
      if (!typeStats[key]) typeStats[key] = { open: 0, breached: 0, frTimes: [], resTimes: [] };
      if (!r.resolvedAt) typeStats[key].open++;
      if (r.firstResponseBreachedAt || r.resolutionBreachedAt) typeStats[key].breached++;
      if (r.firstResponseAt) typeStats[key].frTimes.push(r.firstResponseAt - r.createdAt);
      if (r.resolvedAt) typeStats[key].resTimes.push(r.resolvedAt - r.createdAt);
    }

    const typeLines = Object.entries(typeStats)
      .sort((a, b) => b[1].breached - a[1].breached)
      .slice(0, 8)
      .map(([type, s]) => {
        const avgFR = s.frTimes.length ? formatMs(s.frTimes.reduce((a, b) => a + b, 0) / s.frTimes.length) : '_N/A_';
        const breachMark = s.breached > 0 ? ` 🚨 ${s.breached}` : ' ✅';
        return `**${type}**${breachMark} · FR avg: ${avgFR}`;
      });

    const compliant = closed.filter(r => !r.firstResponseBreachedAt && !r.resolutionBreachedAt).length;
    const rate = closed.length ? Math.round((compliant / closed.length) * 100) : 100;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📊 SLA Statistics')
      .addFields(
        { name: '📋 Total Tracked', value: String(history.length), inline: true },
        { name: '🟢 Open', value: String(openRecs.length), inline: true },
        { name: '✅ Closed', value: String(closed.length), inline: true },
        { name: '✅ Compliance Rate', value: `**${rate}%**`, inline: true },
        { name: '🚨 Total Breaches', value: String(history.filter(r => r.firstResponseBreachedAt || r.resolutionBreachedAt).length), inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '📊 By Ticket Type (recent 100)', value: typeLines.join('\n') || '_No data_', inline: false },
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SLA.HOME).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SLA.CC_HOME).setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({ content: '', embeds: [embed], components: [row] });
  }

  private async navHistory(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await interaction.deferUpdate();
    const records = await slaEngine.getHistory(guild.id, 15);
    const now = Date.now();

    const lines = records.map(r => {
      const frS = r.firstResponseAt ? '✅' : r.firstResponseBreachedAt ? '🚨' : r.firstResponseStatus === 'critical' ? '🔴' : r.firstResponseStatus === 'warning' ? '⚠️' : '⏳';
      const resS = r.resolvedAt ? '✅' : r.resolutionBreachedAt ? '🚨' : r.resolutionStatus === 'critical' ? '🔴' : r.resolutionStatus === 'warning' ? '⚠️' : '⏳';
      const age = formatMs(now - r.createdAt);
      const statusStr = r.resolvedAt ? '🔒 closed' : 'open ' + age;
      return `${frS}/${resS} **${r.ticketType}** #${r.ticketNumber} — <t:${Math.floor(r.createdAt / 1000)}:R> (${statusStr})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📜 SLA History (Latest 15)')
      .setDescription(
        `**Legend:** FR/Res status — ✅ met · ⏳ pending · ⚠️ warning · 🔴 critical · 🚨 breached\n\n${lines.join('\n') || '_No SLA records yet_'}`,
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SLA.HOME).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SLA.STATS).setLabel('📊 Statistics').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SLA.CC_HOME).setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({ content: '', embeds: [embed], components: [row] });
  }
}

export const slaDesigner = new SLADesigner();
