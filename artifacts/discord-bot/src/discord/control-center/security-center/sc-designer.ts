// ─────────────────────────────────────────────────────────────────────────────
// Security Center Designer — Control Center page for Security Center Pro.
// Handles all sc:* custom-ID interactions (buttons, select menus, modals).
// Entry point: the "🛡️ Security Center" button on the CC 'security' category.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
  type Guild,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type RoleSelectMenuInteraction,
  type ModalSubmitInteraction,
  type InteractionUpdateOptions,
} from 'discord.js';
import {
  ALL_MODULE_KEYS,
  MODULE_META,
  type SecurityModuleKey,
  type SecurityGuildConfig,
  type SecurityModuleConfig,
} from '../../../community/security/security-types';
import {
  getGuildConfig,
  patchGuildConfig,
  patchModuleConfig,
  toggleModule,
} from '../../../community/security/security-store';
import {
  enableEmergencyMode,
  disableEmergencyMode,
  emitSecurityLog,
} from '../../../community/security/security-engine';
import { logger } from '../../../utils/logger';

// ── Custom-ID namespace ───────────────────────────────────────────────────────
// sc:home                → dashboard page 0
// sc:select:<page>       → StringSelectMenu selection → navs to module
// sc:pg:<n>              → navigate to dashboard page n (pagination)
// sc:mod:<key>           → module detail
// sc:toggle:<key>        → toggle module on/off
// sc:edit:<key>          → open edit settings modal (no defer)
// sc:log:<key>           → open log channel modal (no defer)
// sc:words:<key>         → open bad words modal, anti_bad_words only (no defer)
// sc:test:<key>          → simulation/test page
// sc:emergency           → emergency mode page
// sc:emergency:on        → enable emergency
// sc:emergency:off       → disable emergency (restore)
// sc:setmenrole          → show native RoleSelectMenu picker for the global alert mention role
// sc:setmenrole:s        → RoleSelectMenu submit: save selected role as securityMentionRoleId
// sc:clrmenrole          → clear the global security mention role
// sc:mod:setmenrole:<k>  → show RoleSelectMenu picker for per-module mention role (overrides global)
// sc:mod:setmenrole:s:<k>→ RoleSelectMenu submit: save per-module mentionRoleId
// sc:mod:clrmenrole:<k>  → clear the per-module mention role (falls back to global)
// sc:modal:edit:<key>    → modal submit: edit settings
// sc:modal:log:<key>     → modal submit: log channel
// sc:modal:words:<key>   → modal submit: bad words

export function isSCInteraction(customId: string): boolean {
  return customId.startsWith('sc:');
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function parseTimeWindow(str: string): number | null {
  const m = str.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!m) return null;
  const n    = parseFloat(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  switch (unit) {
    case 'ms': return n;
    case 's':  return n * 1_000;
    case 'm':  return n * 60_000;
    case 'h':  return n * 3_600_000;
    default:   return null;
  }
}

function formatMs(ms: number): string {
  if (ms < 1_000)      return `${ms}ms`;
  if (ms < 60_000)     return `${ms / 1_000}s`;
  if (ms < 3_600_000)  return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Discord hard limit for StringSelectMenu options. */
const MAX_SC_OPTIONS = 25;

const PUNISH_EMOJI: Record<string, string> = {
  warn: '⚠️', timeout: '⏰', kick: '👢', ban: '🔨',
};

type NavInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | RoleSelectMenuInteraction;

// ── Embed builders ────────────────────────────────────────────────────────────

function dashboardEmbed(guildCfg: SecurityGuildConfig): EmbedBuilder {
  const mods = guildCfg.modules;
  const activeCount = ALL_MODULE_KEYS.filter(k => mods[k]?.enabled).length;

  const half  = Math.ceil(ALL_MODULE_KEYS.length / 2);
  const lines = ALL_MODULE_KEYS.map(key => {
    const { emoji, label } = MODULE_META[key];
    return `${mods[key]?.enabled ? '✅' : '❌'} ${emoji} ${label}`;
  });

  const alertRoleValue = guildCfg.securityMentionRoleId
    ? `<@&${guildCfg.securityMentionRoleId}> — pinged on every detection & emergency`
    : '`Not set` — use **Set Alert Role** below to configure';

  return new EmbedBuilder()
    .setColor(guildCfg.emergencyMode ? 0xed4245 : 0x5865f2)
    .setTitle('🛡️ Security Center Pro')
    .setDescription(
      `**${activeCount}/${ALL_MODULE_KEYS.length}** protection modules active.\n` +
      `Select a module to configure it, or manage Emergency Mode below.`,
    )
    .addFields(
      { name: '🔰 Protections (A)', value: lines.slice(0, half).join('\n'),  inline: true },
      { name: '🔰 Protections (B)', value: lines.slice(half).join('\n'),     inline: true },
      {
        name:   '🚨 Emergency Mode',
        value:  guildCfg.emergencyMode
          ? `🚨 **ACTIVE** — ${guildCfg.emergencyLockedChannels.length} channels locked`
          : '✅ Inactive',
        inline: false,
      },
      {
        name:   '🔔 Alert Mention Role',
        value:  alertRoleValue,
        inline: false,
      },
    )
    .setFooter({ text: 'Security Center Pro — powered by Mufasa' });
}

function moduleStatusEmbed(
  key:       SecurityModuleKey,
  cfg:       SecurityModuleConfig,
  guildCfg:  SecurityGuildConfig,
): EmbedBuilder {
  const { emoji, label, description, color } = MODULE_META[key];

  const logCh = cfg.logChannelId
    ? `<#${cfg.logChannelId}>`
    : guildCfg.securityLogChannelId
      ? `<#${guildCfg.securityLogChannelId}> *(global)*`
      : '`Not configured`';

  const trusted = [
    ...cfg.trustedRoles.map(id => `<@&${id}>`),
    ...cfg.trustedUsers.map(id => `<@${id}>`),
  ];

  const mentionRoleValue = cfg.mentionRoleId
    ? `<@&${cfg.mentionRoleId}> *(module)*`
    : guildCfg.securityMentionRoleId
      ? `<@&${guildCfg.securityMentionRoleId}> *(global fallback)*`
      : '`None set`';

  return new EmbedBuilder()
    .setColor(cfg.enabled ? color : 0x4f545c)
    .setTitle(`${emoji} ${label}`)
    .setDescription(description)
    .addFields(
      { name: '🔒 Status',      value: cfg.enabled ? '✅ **Enabled**' : '❌ **Disabled**',              inline: true },
      { name: '⚖️ Punishment',   value: `${PUNISH_EMOJI[cfg.punishment] ?? '❓'} \`${cfg.punishment}\``, inline: true },
      { name: '📊 Trigger',      value: `**${cfg.actionLimit}** events in **${formatMs(cfg.timeWindowMs)}**`, inline: true },
      { name: '📋 Log Channel',  value: logCh,                                                            inline: true },
      { name: '🤖 Ignore Bots',  value: cfg.ignoreBots ? '✅ Yes' : '❌ No',                             inline: true },
      { name: '🔔 Mention Role', value: mentionRoleValue,                                                 inline: true },
      { name: '🛡️ Trusted',      value: trusted.length ? trusted.slice(0, 8).join(' ') : '`None`',       inline: true },
      { name: '⬛ Whitelist',     value: cfg.whitelist.length ? `${cfg.whitelist.length} user(s)` : '`Empty`', inline: true },
    )
    .setFooter({ text: 'Security Center Pro' });
}

function modulePreviewEmbed(key: SecurityModuleKey, cfg: SecurityModuleConfig): EmbedBuilder {
  const { emoji, label, color, eventLabel } = MODULE_META[key];
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${label} — Detection Preview`)
    .setDescription('*This is a preview of what a real detection log will look like in your log channel.*')
    .addFields(
      { name: '⚡ Action',    value: eventLabel,                          inline: true },
      { name: '👤 Executor',  value: '`User#0000`',                       inline: true },
      { name: '🕐 Time',      value: 'Just now',                          inline: true },
      { name: '⚖️ Punishment', value: `\`${cfg.punishment.toUpperCase()}\``, inline: true },
    )
    .setFooter({ text: `Security Center Pro · ${label}` });
}

function emergencyEmbed(guildCfg: SecurityGuildConfig): EmbedBuilder {
  const active = guildCfg.emergencyMode;
  return new EmbedBuilder()
    .setColor(active ? 0xed4245 : 0x57f287)
    .setTitle(`🚨 Emergency Mode — ${active ? 'ACTIVE' : 'Inactive'}`)
    .setDescription(
      active
        ? `**Emergency Mode is currently ACTIVE.**\n\n` +
          `**${guildCfg.emergencyLockedChannels.length}** channels are locked.\n` +
          'All active invites have been deleted.\n\n' +
          'Click **Restore Server** to unlock channels and return to normal.'
        : '**Emergency Mode is currently inactive.**\n\n' +
          'When activated, Emergency Mode will:\n' +
          '• **Lock all text channels** for @everyone\n' +
          '• **Delete all active invites**\n' +
          '• **Send an alert** to your security log channel\n\n' +
          '⚠️ Use only during an active raid or attack.',
    )
    .setFooter({ text: 'Security Center Pro · Emergency Mode' });
}

// ── Shared back row ───────────────────────────────────────────────────────────

function backRow(key?: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(key ? [
      new ButtonBuilder()
        .setCustomId(`sc:mod:${key}`)
        .setLabel('← Module')
        .setStyle(ButtonStyle.Secondary),
    ] : []),
    new ButtonBuilder().setCustomId('sc:home').setLabel('🛡️ Security Center').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cc:home').setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
  );
}

// ── Designer ──────────────────────────────────────────────────────────────────

export class SecurityCenterDesigner {

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (
      !interaction.isButton() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isModalSubmit() &&
      !interaction.isRoleSelectMenu()
    ) return;

    try {
      await this.route(interaction as ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | RoleSelectMenuInteraction, guild);
    } catch (err) {
      logger.error('[SC] Interaction error', err);
      const i = interaction as ButtonInteraction;
      if (i.deferred || i.replied) {
        await i.editReply({ content: '❌ An error occurred in Security Center. Please try again.', embeds: [], components: [] }).catch(() => {});
      } else {
        await i.reply({ content: '❌ An error occurred in Security Center. Please try again.', embeds: [], components: [], ephemeral: true }).catch(() => {});
      }
    }
  }

  private async route(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | RoleSelectMenuInteraction,
    guild: Guild,
  ): Promise<void> {
    const id = interaction.customId;

    // ── RoleSelectMenu ───────────────────────────────────────────────────────
    // sc:setmenrole:s — role picker submit: save selected role as securityMentionRoleId (global)
    if (interaction.isRoleSelectMenu() && id === 'sc:setmenrole:s') {
      const roleId = (interaction as RoleSelectMenuInteraction).values[0] ?? undefined;
      await interaction.deferUpdate();
      await patchGuildConfig(guild.id, { securityMentionRoleId: roleId });
      await this.renderDashboard(interaction as NavInteraction, guild, 0);
      return;
    }

    // sc:mod:setmenrole:s:<key> — per-module role picker submit
    if (interaction.isRoleSelectMenu() && id.startsWith('sc:mod:setmenrole:s:')) {
      const key    = id.slice('sc:mod:setmenrole:s:'.length) as SecurityModuleKey;
      const roleId = (interaction as RoleSelectMenuInteraction).values[0] || undefined;
      await interaction.deferUpdate();
      await patchModuleConfig(guild.id, key, { mentionRoleId: roleId });
      await this.renderModule(interaction as NavInteraction, guild, key);
      return;
    }

    // ── StringSelectMenu ─────────────────────────────────────────────────────
    // sc:select:<page> — module picker (page encoded in custom_id, value = module key)
    if (interaction.isStringSelectMenu() && id.startsWith('sc:select:')) {
      const key = (interaction as StringSelectMenuInteraction).values[0] as SecurityModuleKey;
      await interaction.deferUpdate();
      await this.renderModule(interaction as NavInteraction, guild, key);
      return;
    }

    // ── Modal submissions ────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const mi = interaction as ModalSubmitInteraction;
      if (id.startsWith('sc:modal:edit:')) {
        await mi.deferUpdate();
        await this.handleEditModal(mi, guild, id.slice('sc:modal:edit:'.length) as SecurityModuleKey);
      } else if (id.startsWith('sc:modal:log:')) {
        // handleLogModal defers internally after validation
        await this.handleLogModal(mi, guild, id.slice('sc:modal:log:'.length) as SecurityModuleKey);
      } else if (id.startsWith('sc:modal:words:')) {
        await mi.deferUpdate();
        await this.handleWordsModal(mi, guild, id.slice('sc:modal:words:'.length) as SecurityModuleKey);
      } else {
        await mi.deferUpdate();
      }
      return;
    }

    // ── Buttons ──────────────────────────────────────────────────────────────
    if (!interaction.isButton()) return;
    const btn = interaction as ButtonInteraction;

    // Modal-opening buttons — do NOT defer, call showModal directly
    if (id.startsWith('sc:edit:'))  { await this.showEditModal(btn, guild, id.slice('sc:edit:'.length) as SecurityModuleKey); return; }
    if (id.startsWith('sc:log:'))   { await this.showLogModal(btn, guild, id.slice('sc:log:'.length) as SecurityModuleKey); return; }
    if (id.startsWith('sc:words:')) { await this.showWordsModal(btn, guild, id.slice('sc:words:'.length) as SecurityModuleKey); return; }

    // Navigation/action buttons — defer first
    await btn.deferUpdate();

    if (id === 'sc:home')            { await this.renderDashboard(btn, guild, 0); return; }
    if (id.startsWith('sc:pg:'))    { await this.renderDashboard(btn, guild, parseInt(id.slice('sc:pg:'.length), 10) || 0); return; }
    if (id === 'sc:emergency')       { await this.renderEmergency(btn, guild); return; }
    if (id === 'sc:emergency:on')    { await this.doEmergencyOn(btn, guild);   return; }
    if (id === 'sc:emergency:off')   { await this.doEmergencyOff(btn, guild);  return; }
    if (id === 'sc:setmenrole')                      { await this.showMentionRolePicker(btn, guild); return; }
    if (id === 'sc:clrmenrole')                      { await this.clearMentionRole(btn, guild); return; }
    if (id.startsWith('sc:mod:setmenrole:'))         { await this.showModuleMentionRolePicker(btn, guild, id.slice('sc:mod:setmenrole:'.length) as SecurityModuleKey); return; }
    if (id.startsWith('sc:mod:clrmenrole:'))         { await this.clearModuleMentionRole(btn, guild, id.slice('sc:mod:clrmenrole:'.length) as SecurityModuleKey); return; }
    if (id.startsWith('sc:mod:'))                    { await this.renderModule(btn, guild, id.slice('sc:mod:'.length) as SecurityModuleKey); return; }
    if (id.startsWith('sc:toggle:')) { await this.doToggle(btn, guild, id.slice('sc:toggle:'.length) as SecurityModuleKey); return; }
    if (id.startsWith('sc:test:'))   { await this.renderTest(btn, guild, id.slice('sc:test:'.length) as SecurityModuleKey); return; }

    logger.warning(`[SC] Unrouted custom ID: ${id}`);
  }

  // ── Render: Dashboard ─────────────────────────────────────────────────────
  //
  // Paginated: splits ALL_MODULE_KEYS into pages of MAX_SC_OPTIONS (25) so
  // Discord's StringSelectMenu limit is never exceeded no matter how many
  // modules are added in the future.

  async renderDashboard(interaction: NavInteraction, guild: Guild, page = 0): Promise<void> {
    const cfg = await getGuildConfig(guild.id);

    const totalModules = ALL_MODULE_KEYS.length;
    const totalPages   = Math.max(1, Math.ceil(totalModules / MAX_SC_OPTIONS));
    const safePage     = Math.max(0, Math.min(page, totalPages - 1));

    const pageKeys = ALL_MODULE_KEYS.slice(safePage * MAX_SC_OPTIONS, (safePage + 1) * MAX_SC_OPTIONS);

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sc:select:${safePage}`)
        .setPlaceholder(
          totalPages > 1
            ? `🔍 Modules (page ${safePage + 1}/${totalPages}) — select to configure...`
            : '🔍 Select a security module to configure...',
        )
        .addOptions(
          pageKeys.map(key => {
            const { emoji, label, description } = MODULE_META[key];
            const on = cfg.modules[key]?.enabled ?? false;
            return new StringSelectMenuOptionBuilder()
              .setValue(key)
              .setLabel(`${on ? '✅' : '❌'} ${label}`)
              .setDescription(description.slice(0, 100))
              .setEmoji(emoji);
          }),
        ),
    );

    const emergencyBtn = cfg.emergencyMode
      ? new ButtonBuilder().setCustomId('sc:emergency').setLabel('🚨 Emergency: ACTIVE').setStyle(ButtonStyle.Danger)
      : new ButtonBuilder().setCustomId('sc:emergency').setLabel('🚨 Emergency Mode').setStyle(ButtonStyle.Secondary);

    // Bottom row: pagination (only shown when there is more than one page) + nav
    const bottomButtons: ButtonBuilder[] = [];
    if (totalPages > 1) {
      bottomButtons.push(
        new ButtonBuilder()
          .setCustomId(`sc:pg:${safePage - 1}`)
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === 0),
        new ButtonBuilder()
          .setCustomId(`sc:pg:${safePage + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
      );
    }
    bottomButtons.push(
      emergencyBtn,
      new ButtonBuilder().setCustomId('cc:cat:security').setLabel('← Security').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cc:home').setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
    );

    // Alert mention role row — always shown so admins can configure it easily
    const mentionRoleRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('sc:setmenrole')
        .setLabel(cfg.securityMentionRoleId ? '🔔 Alert Role: Set ✅' : '🔔 Set Alert Role')
        .setStyle(cfg.securityMentionRoleId ? ButtonStyle.Success : ButtonStyle.Primary),
      ...(cfg.securityMentionRoleId ? [
        new ButtonBuilder()
          .setCustomId('sc:clrmenrole')
          .setLabel('🗑 Clear Alert Role')
          .setStyle(ButtonStyle.Danger),
      ] : []),
    );

    const payload: InteractionUpdateOptions = {
      embeds:     [dashboardEmbed(cfg)],
      components: [
        selectRow,
        new ActionRowBuilder<ButtonBuilder>().addComponents(...bottomButtons),
        mentionRoleRow,
      ],
    };

    await interaction.editReply(payload);
  }

  // ── Render: Module Detail ─────────────────────────────────────────────────

  private async renderModule(interaction: NavInteraction, guild: Guild, key: SecurityModuleKey): Promise<void> {
    const guildCfg = await getGuildConfig(guild.id);
    const cfg      = guildCfg.modules[key];

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      cfg.enabled
        ? new ButtonBuilder().setCustomId(`sc:toggle:${key}`).setLabel('❌ Disable').setStyle(ButtonStyle.Danger)
        : new ButtonBuilder().setCustomId(`sc:toggle:${key}`).setLabel('✅ Enable').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sc:edit:${key}`).setLabel('⚙️ Edit Settings').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`sc:log:${key}`).setLabel('📋 Log Channel').setStyle(ButtonStyle.Secondary),
      ...(key === 'anti_bad_words' ? [
        new ButtonBuilder().setCustomId(`sc:words:${key}`).setLabel('📝 Bad Words').setStyle(ButtonStyle.Secondary),
      ] : []),
    );

    // Row 2: per-module mention role controls
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`sc:mod:setmenrole:${key}`)
        .setLabel(cfg.mentionRoleId ? '🔔 Mention Role: Set ✅' : '🔔 Set Mention Role')
        .setStyle(cfg.mentionRoleId ? ButtonStyle.Success : ButtonStyle.Primary),
      ...(cfg.mentionRoleId ? [
        new ButtonBuilder()
          .setCustomId(`sc:mod:clrmenrole:${key}`)
          .setLabel('🗑 Clear Mention Role')
          .setStyle(ButtonStyle.Danger),
      ] : []),
      new ButtonBuilder().setCustomId(`sc:test:${key}`).setLabel('🧪 Simulate').setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sc:home').setLabel('🛡️ Security Center').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cc:home').setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      embeds:     [moduleStatusEmbed(key, cfg, guildCfg), modulePreviewEmbed(key, cfg)],
      components: [row1, row2, row3],
    });
  }

  // ── Render: Test Simulation ───────────────────────────────────────────────

  private async renderTest(interaction: NavInteraction, guild: Guild, key: SecurityModuleKey): Promise<void> {
    const guildCfg = await getGuildConfig(guild.id);
    const cfg      = guildCfg.modules[key];
    const { emoji, label, color, eventLabel } = MODULE_META[key];

    const targetChannelId = cfg.logChannelId ?? guildCfg.securityLogChannelId;

    // Attempt to actually send the simulation embed to the configured log channel.
    let logStatus: string;
    if (targetChannelId) {
      try {
        await emitSecurityLog(
          guild,
          key,
          cfg,
          guildCfg.securityLogChannelId,
          {
            executor:   interaction.user,
            target:     '#general (simulation)',
            action:     `${eventLabel} ⚗️ SIMULATION`,
            detail:     'Test simulation triggered via Security Center Pro.',
          },
        );
        logStatus = `✅ Test log delivered to <#${targetChannelId}>`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logStatus = `❌ Log send failed: ${msg}`;
      }
    } else {
      logStatus = '`No log channel configured — set one via 📋 Log Channel`';
    }

    const simEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} ${label} — ⚗️ SIMULATION`)
      .setDescription(
        '**No real action was taken.** This is a simulated detection.\n\n' +
        `📋 **Log channel:** ${logStatus}`,
      )
      .addFields(
        { name: '⚡ Action',    value: eventLabel,                               inline: true  },
        { name: '👤 Executor',  value: `<@${interaction.user.id}>`,              inline: true  },
        { name: '🕐 Time',      value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true  },
        { name: '🎯 Target',    value: '`#general`',                             inline: true  },
        { name: '📋 Detail',    value: `Simulation of **${label}** detection.`,  inline: false },
        { name: '⚖️ Punishment', value: `\`${cfg.punishment.toUpperCase()}\``,    inline: true  },
      )
      .setFooter({ text: `Security Center Pro · ${label} · ⚗️ SIMULATION` })
      .setTimestamp();

    await interaction.editReply({
      embeds:     [simEmbed],
      components: [backRow(key)],
    });
  }

  // ── Render: Emergency Mode ────────────────────────────────────────────────

  private async renderEmergency(interaction: NavInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildConfig(guild.id);

    const actionBtn = cfg.emergencyMode
      ? new ButtonBuilder().setCustomId('sc:emergency:off').setLabel('✅ Restore Server').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId('sc:emergency:on').setLabel('🚨 Enable Emergency').setStyle(ButtonStyle.Danger);

    await interaction.editReply({
      embeds:     [emergencyEmbed(cfg)],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          actionBtn,
          new ButtonBuilder().setCustomId('sc:home').setLabel('🛡️ Security Center').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('cc:home').setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private async doEmergencyOn(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg    = await getGuildConfig(guild.id);
    const locked = await enableEmergencyMode(guild, cfg.securityLogChannelId, cfg.securityMentionRoleId);
    await patchGuildConfig(guild.id, { emergencyMode: true, emergencyLockedChannels: locked });
    await this.renderEmergency(interaction, guild);
  }

  private async doEmergencyOff(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildConfig(guild.id);
    await disableEmergencyMode(guild, cfg.emergencyLockedChannels, cfg.securityLogChannelId, cfg.securityMentionRoleId);
    await patchGuildConfig(guild.id, { emergencyMode: false, emergencyLockedChannels: [] });
    await this.renderEmergency(interaction, guild);
  }

  private async showMentionRolePicker(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildConfig(guild.id);

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('sc:setmenrole:s')
      .setPlaceholder('🔔 Select role to ping on security alerts...')
      .setMinValues(0)
      .setMaxValues(1);

    const payload: InteractionUpdateOptions = {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🔔 Set Security Alert Role')
          .setDescription(
            'Pick the role to @mention whenever a security module detects a violation ' +
            'or when Emergency Mode is activated/deactivated.\n\n' +
            `**Current:** ${cfg.securityMentionRoleId ? `<@&${cfg.securityMentionRoleId}>` : '_None_'}\n\n` +
            'Select **0 roles** to clear. Select **1 role** to set.',
          )
          .setFooter({ text: 'Security Center Pro · Alert Role Picker' }),
      ],
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('sc:home').setLabel('← Cancel').setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
    await interaction.editReply(payload);
  }

  private async clearMentionRole(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    await patchGuildConfig(guild.id, { securityMentionRoleId: undefined });
    await this.renderDashboard(interaction, guild, 0);
  }

  private async showModuleMentionRolePicker(
    interaction: ButtonInteraction,
    guild: Guild,
    key: SecurityModuleKey,
  ): Promise<void> {
    const guildCfg = await getGuildConfig(guild.id);
    const cfg      = guildCfg.modules[key];
    const { emoji, label } = MODULE_META[key];

    const currentValue = cfg.mentionRoleId
      ? `<@&${cfg.mentionRoleId}> *(module-specific)*`
      : guildCfg.securityMentionRoleId
        ? `_None — will use global: <@&${guildCfg.securityMentionRoleId}>_`
        : '_None configured_';

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`sc:mod:setmenrole:s:${key}`)
      .setPlaceholder(`🔔 Select role to ping for ${label} alerts...`)
      .setMinValues(0)
      .setMaxValues(1);

    const payload: InteractionUpdateOptions = {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🔔 Set Mention Role — ${emoji} ${label}`)
          .setDescription(
            `Pick a role to @mention specifically when **${label}** detects a violation.\n` +
            `This **overrides** the global Security Alert Role for this module only.\n\n` +
            `**Current:** ${currentValue}\n\n` +
            'Select **0 roles** to clear the override (falls back to global). Select **1 role** to set.',
          )
          .setFooter({ text: `Security Center Pro · ${label} · Mention Role` }),
      ],
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`sc:mod:${key}`).setLabel('← Module').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('sc:home').setLabel('🛡️ Security Center').setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
    await interaction.editReply(payload);
  }

  private async clearModuleMentionRole(
    interaction: ButtonInteraction,
    guild: Guild,
    key: SecurityModuleKey,
  ): Promise<void> {
    await patchModuleConfig(guild.id, key, { mentionRoleId: undefined });
    await this.renderModule(interaction, guild, key);
  }

  private async doToggle(interaction: ButtonInteraction, guild: Guild, key: SecurityModuleKey): Promise<void> {
    await toggleModule(guild.id, key);
    await this.renderModule(interaction, guild, key);
  }

  // ── Modal opens ───────────────────────────────────────────────────────────

  private async showEditModal(interaction: ButtonInteraction, guild: Guild, key: SecurityModuleKey): Promise<void> {
    const guildCfg = await getGuildConfig(guild.id);
    const cfg      = guildCfg.modules[key];
    const { emoji, label } = MODULE_META[key];

    const trusted = [...cfg.trustedRoles, ...cfg.trustedUsers].join(', ');

    const modal = new ModalBuilder()
      .setCustomId(`sc:modal:edit:${key}`)
      .setTitle(`${emoji} Edit — ${label}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('punishment')
            .setLabel('Punishment (warn / timeout / kick / ban)')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.punishment)
            .setRequired(true)
            .setMaxLength(10),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('action_limit')
            .setLabel('Action Limit (events to trigger violation)')
            .setStyle(TextInputStyle.Short)
            .setValue(String(cfg.actionLimit))
            .setRequired(true)
            .setMaxLength(5),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('time_window')
            .setLabel('Time Window (e.g. 10s, 1m, 30s, 1h)')
            .setStyle(TextInputStyle.Short)
            .setValue(formatMs(cfg.timeWindowMs))
            .setRequired(true)
            .setMaxLength(10),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('trusted')
            .setLabel('Trusted Role/User IDs (comma-separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(trusted)
            .setRequired(false)
            .setMaxLength(1000),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('ignore_bots')
            .setLabel('Ignore Bots? (yes / no)')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.ignoreBots ? 'yes' : 'no')
            .setRequired(true)
            .setMaxLength(3),
        ),
      );

    await interaction.showModal(modal);
  }

  private async showLogModal(interaction: ButtonInteraction, guild: Guild, key: SecurityModuleKey): Promise<void> {
    const guildCfg = await getGuildConfig(guild.id);
    const cfg      = guildCfg.modules[key];
    const { label } = MODULE_META[key];

    const modal = new ModalBuilder()
      .setCustomId(`sc:modal:log:${key}`)
      .setTitle(`📋 Log Channel — ${label}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('log_channel_id')
            .setLabel('Module Log Channel ID (blank=global)')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.logChannelId ?? '')
            .setRequired(false)
            .setMaxLength(25),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('global_log_channel_id')
            .setLabel('Global Security Log Channel ID')
            .setStyle(TextInputStyle.Short)
            .setValue(guildCfg.securityLogChannelId ?? '')
            .setRequired(false)
            .setMaxLength(25),
        ),
      );

    await interaction.showModal(modal);
  }

  private async showWordsModal(interaction: ButtonInteraction, guild: Guild, key: SecurityModuleKey): Promise<void> {
    const guildCfg = await getGuildConfig(guild.id);
    const cfg      = guildCfg.modules[key];
    const words    = ((cfg.extra?.words as string[]) ?? []).join(', ');

    const modal = new ModalBuilder()
      .setCustomId(`sc:modal:words:${key}`)
      .setTitle('📝 Bad Word Filter List')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('words')
            .setLabel('Words/phrases to block (comma-separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(words)
            .setRequired(false)
            .setPlaceholder('e.g. spam, slur, badword, offensive phrase')
            .setMaxLength(2000),
        ),
      );

    await interaction.showModal(modal);
  }

  // ── Modal handlers ────────────────────────────────────────────────────────

  private async handleEditModal(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    key: SecurityModuleKey,
  ): Promise<void> {
    const rawPunish    = interaction.fields.getTextInputValue('punishment').trim().toLowerCase();
    const rawLimit     = interaction.fields.getTextInputValue('action_limit').trim();
    const rawWindow    = interaction.fields.getTextInputValue('time_window').trim();
    const rawTrusted   = interaction.fields.getTextInputValue('trusted').trim();
    const rawIgnoreBots = interaction.fields.getTextInputValue('ignore_bots').trim().toLowerCase();

    const validPunishments = ['warn', 'timeout', 'kick', 'ban'];
    const punishment = validPunishments.includes(rawPunish)
      ? rawPunish as 'warn' | 'timeout' | 'kick' | 'ban'
      : 'timeout';

    const actionLimit  = Math.max(1, Math.min(100, parseInt(rawLimit, 10) || 5));
    const timeWindowMs = parseTimeWindow(rawWindow) ?? 10_000;
    const ignoreBots   = rawIgnoreBots !== 'no';

    // Resolve IDs as roles or users
    const ids = rawTrusted
      .split(',')
      .map(s => s.trim())
      .filter(s => /^\d{15,20}$/.test(s));

    const trustedRoles: string[] = [];
    const trustedUsers: string[] = [];
    for (const id of ids) {
      if (guild.roles.cache.has(id)) trustedRoles.push(id);
      else trustedUsers.push(id);
    }

    await patchModuleConfig(guild.id, key, {
      punishment,
      actionLimit,
      timeWindowMs,
      trustedRoles,
      trustedUsers,
      ignoreBots,
    });

    await this.renderModule(interaction, guild, key);
  }

  private async handleLogModal(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    key: SecurityModuleKey,
  ): Promise<void> {
    const rawModuleId = interaction.fields.getTextInputValue('log_channel_id').trim();
    const rawGlobalId = interaction.fields.getTextInputValue('global_log_channel_id').trim();

    // Validate: must be empty (clear) or a valid Discord snowflake (17–20 digits)
    const isValidId = (s: string) => s === '' || /^\d{17,20}$/.test(s);

    if (!isValidId(rawModuleId) || !isValidId(rawGlobalId)) {
      const bad = [
        !isValidId(rawModuleId)  && `Module: \`${rawModuleId}\``,
        !isValidId(rawGlobalId) && `Global: \`${rawGlobalId}\``,
      ].filter(Boolean).join(', ');
      await interaction.reply({
        content: `❌ **Invalid channel ID${!isValidId(rawModuleId) && !isValidId(rawGlobalId) ? 's' : ''}:** ${bad}\n` +
          `Channel IDs must be 17–20 digit numbers (right-click a channel → Copy Channel ID). Leave blank to clear.`,
        ephemeral: true,
      });
      return;
    }

    const logChannelId = rawModuleId || undefined;
    const globalId     = rawGlobalId || undefined;

    await interaction.deferUpdate();

    await patchModuleConfig(guild.id, key, { logChannelId });
    await patchGuildConfig(guild.id, { securityLogChannelId: globalId });

    await this.renderModule(interaction, guild, key);
  }

  private async handleWordsModal(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    key: SecurityModuleKey,
  ): Promise<void> {
    const rawWords = interaction.fields.getTextInputValue('words').trim();
    const words    = rawWords
      .split(',')
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0);

    const existing = (await getGuildConfig(guild.id)).modules[key].extra ?? {};
    await patchModuleConfig(guild.id, key, { extra: { ...existing, words } });

    await this.renderModule(interaction, guild, key);
  }
}

export const securityCenterDesigner = new SecurityCenterDesigner();
