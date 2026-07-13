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
} from 'discord.js';
import {
  LOG_CATEGORIES,
  LOG_TYPE_META,
  CRITICAL_LOG_TYPES,
  getCategoryForType,
  type LogType,
  type GuildLogConfig,
  type LogCategoryKey,
} from '../../../discord/logging/log-store';
import { LG } from './lg-ids';
import { CC } from '../cc-ids';

type AnyRow =
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<StringSelectMenuBuilder>
  | ActionRowBuilder<RoleSelectMenuBuilder>;

export interface LGPayload {
  content: string;
  embeds: EmbedBuilder[];
  components: AnyRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function btn(
  label: string,
  id: string,
  style: ButtonStyle,
  disabled = false,
): ButtonBuilder {
  return new ButtonBuilder()
    .setLabel(label)
    .setCustomId(id)
    .setStyle(style)
    .setDisabled(disabled);
}

function homeRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🏠 Home', CC.HOME, ButtonStyle.Secondary),
  );
}

function backRow(type: LogType): ActionRowBuilder<ButtonBuilder> {
  const catKey = getCategoryForType(type);
  const cat = catKey ? LOG_CATEGORIES.find(c => c.key === catKey) : null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    cat
      ? btn(`← ${cat.emoji} ${cat.label}`, LG.cat(catKey!), ButtonStyle.Secondary)
      : btn('← Logs', LG.DASH, ButtonStyle.Secondary),
    btn('📋 Logs', LG.DASH, ButtonStyle.Secondary),
    btn('🏠 Home', CC.HOME, ButtonStyle.Secondary),
  );
}

function colorHex(n: number): string {
  return `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
}

function idList(ids: string[] | undefined): string {
  if (!ids?.length) return '_None_';
  return ids.map(id => `<@${id}>`).join(' ').slice(0, 512);
}

function roleList(ids: string[] | undefined): string {
  if (!ids?.length) return '_None_';
  return ids.map(id => `<@&${id}>`).join(' ').slice(0, 512);
}

// ── Dashboard (Category Grid) ──────────────────────────────────────────────

export function buildLogsDashboard(cfg: GuildLogConfig): LGPayload {
  // Summarise each category
  const lines: string[] = [];
  for (const cat of LOG_CATEGORIES) {
    const total   = cat.types.length;
    const enabled = cat.types.filter(t => cfg.types[t]?.enabled).length;
    lines.push(`${cat.emoji} **${cat.label}** — ${enabled}/${total} enabled`);
  }

  // Fallback channel
  const allCfg   = cfg.types['logs_all'];
  const allStatus = allCfg?.enabled ? '✅' : '❌';
  const allCh     = allCfg?.channelId ? `<#${allCfg.channelId}>` : '_not set_';

  const embed = new EmbedBuilder()
    .setColor(0x99aab5)
    .setTitle('📋 Server Logging')
    .setDescription(lines.join('\n'))
    .addFields({
      name: `${allStatus} 📋 Fallback Channel (Logs All)`,
      value: `Channel: ${allCh}\nAll enabled types without a dedicated channel fall back here.\nClick **📋 Logs All** below to configure.`,
    })
    .setFooter({ text: 'Select a category to configure individual log types' });

  // Category buttons — 5 per row
  const cats = LOG_CATEGORIES;
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...cats.slice(0, 5).map(c =>
      btn(`${c.emoji} ${c.label}`, LG.cat(c.key), ButtonStyle.Secondary),
    ),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...cats.slice(5).map(c =>
      btn(`${c.emoji} ${c.label}`, LG.cat(c.key), ButtonStyle.Secondary),
    ),
    btn('📋 Logs All', LG.type('logs_all'), ButtonStyle.Secondary),
  );
  const row3 = homeRow();

  return { content: '', embeds: [embed], components: [row1, row2, row3] };
}

// ── Category View ──────────────────────────────────────────────────────────

export function buildCategoryView(catKey: LogCategoryKey, cfg: GuildLogConfig): LGPayload {
  const cat = LOG_CATEGORIES.find(c => c.key === catKey)!;

  const lines: string[] = [];
  for (const type of cat.types) {
    const meta    = LOG_TYPE_META[type];
    const typeCfg = cfg.types[type];
    const status  = typeCfg?.enabled ? '✅' : '❌';
    const ch      = typeCfg?.channelId ? `<#${typeCfg.channelId}>` : '_none_';
    lines.push(`${status} ${meta.emoji} **${meta.label}** — ${ch}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${cat.emoji} ${cat.label} Logs`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Select a log type below to configure it' });

  const select = new StringSelectMenuBuilder()
    .setCustomId(LG.catsel(catKey))
    .setPlaceholder(`⚙️ Configure a ${cat.label} log type...`)
    .addOptions(
      cat.types.map(t => {
        const m  = LOG_TYPE_META[t];
        const tc = cfg.types[t];
        const st = tc?.enabled ? '✅' : '❌';
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${m.emoji} ${m.label}`)
          .setDescription(`${st} ${m.description}`)
          .setValue(t);
      }),
    );

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn('← All Categories', LG.DASH, ButtonStyle.Secondary),
        btn('🏠 Home', CC.HOME, ButtonStyle.Secondary),
      ),
    ],
  };
}

// ── Type Detail (Full Settings Page) ──────────────────────────────────────

export function buildLogTypeDetail(type: LogType, cfg: GuildLogConfig): LGPayload {
  const meta     = LOG_TYPE_META[type];
  const typeCfg  = cfg.types[type] ?? { enabled: false };
  const isEnabled = typeCfg.enabled;
  const isLogsAll = type === 'logs_all';

  // Channel resolution description
  const fallbackCfg = cfg.types['logs_all'];
  let routingDesc: string;
  if (isLogsAll) {
    routingDesc = 'This is the fallback channel. All enabled log types without a dedicated channel will be sent here.';
  } else if (typeCfg.channelId) {
    routingDesc = `Events will be sent to <#${typeCfg.channelId}>.`;
  } else if (fallbackCfg?.enabled && fallbackCfg.channelId) {
    routingDesc = `No dedicated channel — falling back to <#${fallbackCfg.channelId}> (Logs All).`;
  } else {
    routingDesc = 'No channel configured. Set a channel or enable Logs All as a fallback.';
  }

  // Format setting values for display
  const colorVal       = typeCfg.color !== undefined ? colorHex(typeCfg.color) : '_Default_';
  const mentionsVal    = roleList(typeCfg.mentionRoles);
  const ignUsersVal    = idList(typeCfg.ignoreUsers);
  const ignRolesVal    = roleList(typeCfg.ignoreRoles);
  const ignBotsVal     = typeCfg.ignoreBots ? '✅ Yes' : '❌ No';
  const criticalOnly   = typeCfg.mentionCriticalOnly ?? false;
  const isCriticalType = CRITICAL_LOG_TYPES.has(type);
  const hasMentions    = Boolean(typeCfg.mentionRoles?.length);

  const criticalFieldValue = criticalOnly
    ? `✅ Yes — pings only for critical events${!isCriticalType ? '\n⚠️ This type is *not* critical — role will be suppressed' : ''}`
    : '❌ No — pings for all events';

  const canTest = isEnabled && (
    typeCfg.channelId !== undefined ||
    (fallbackCfg?.enabled && fallbackCfg.channelId !== undefined)
  );

  const embed = new EmbedBuilder()
    .setColor(typeCfg.color ?? meta.color)
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setDescription(meta.description)
    .addFields(
      { name: '🔘 Status',          value: isEnabled ? '✅ Enabled' : '❌ Disabled',             inline: true },
      { name: '📢 Channel',         value: typeCfg.channelId ? `<#${typeCfg.channelId}>` : '_not set_', inline: true },
      { name: '🎨 Embed Color',     value: colorVal,                                              inline: true },
      { name: '🤖 Ignore Bots',     value: ignBotsVal,                                            inline: true },
      { name: '🔔 Mention Role',    value: mentionsVal,                                           inline: true },
      { name: '🚨 Critical Only',   value: criticalFieldValue,                                    inline: true },
      { name: '🚫 Ignore Users',    value: ignUsersVal,                                           inline: true },
      { name: '🔇 Ignore Roles',    value: ignRolesVal,                                           inline: true },
      { name: '📌 Routing',         value: routingDesc,                                           inline: false },
    )
    .setFooter({ text: 'All changes save instantly • Use Test Log to verify the channel' });

  const toggleLabel   = isEnabled ? '❌ Disable' : '✅ Enable';
  const toggleStyle   = isEnabled ? ButtonStyle.Danger : ButtonStyle.Success;
  const botsLabel     = typeCfg.ignoreBots ? '🤖 Bots: OFF' : '🤖 Bots: ON';
  const botsStyle     = typeCfg.ignoreBots ? ButtonStyle.Danger : ButtonStyle.Secondary;
  const criticalLabel = criticalOnly ? '🚨 Critical: ON' : '🚨 Critical: OFF';
  const criticalStyle = criticalOnly ? ButtonStyle.Danger : ButtonStyle.Secondary;

  // Row 1: core enable/channel controls
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(toggleLabel,       LG.toggle(type),      toggleStyle),
    btn('📢 Set Channel',  LG.setch(type),       ButtonStyle.Primary),
    btn('🎨 Set Color',    LG.setcolor(type),    ButtonStyle.Primary),
    btn(botsLabel,         LG.toggleBots(type),  botsStyle),
  );

  // Row 2: mention role + ignore controls (5 buttons max)
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🔔 Set Mention Role', LG.setmenrole(type),     ButtonStyle.Primary),
    btn('🗑 Clear Mention',    LG.clrmenrole(type),     ButtonStyle.Danger, !hasMentions),
    btn(criticalLabel,          LG.togglecritical(type), criticalStyle),
    btn('🚫 Ignore Users',     LG.setignoreu(type),     ButtonStyle.Secondary),
    btn('🔇 Ignore Roles',     LG.setignorer(type),     ButtonStyle.Secondary),
  );

  // Row 3: preview & test
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('👁️ Preview',   LG.preview(type), ButtonStyle.Secondary),
    btn('🧪 Test Log',  LG.test(type),    ButtonStyle.Secondary, !canTest),
  );

  return {
    content: '',
    embeds: [embed],
    components: [row1, row2, row3, backRow(type)],
  };
}

// ── Role Picker View ───────────────────────────────────────────────────────
// Replaces the type detail message with an inline RoleSelectMenuBuilder so
// admins can pick roles without a modal. Cancel re-renders the type detail.

export function buildRolePickerView(type: LogType, currentRoles: string[] | undefined): LGPayload {
  const meta       = LOG_TYPE_META[type];
  const isCritical = CRITICAL_LOG_TYPES.has(type);
  const current    = currentRoles?.length
    ? currentRoles.map(id => `<@&${id}>`).join(' ')
    : '_None_';

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`🔔 Set Mention Role — ${meta.emoji} ${meta.label}`)
    .setDescription(
      `Select the role(s) to @mention when **${meta.label}** fires.\n` +
      `The mention is sent alongside the embed, so the role is notified.\n\n` +
      `**Current:** ${current}\n\n` +
      (isCritical
        ? '✅ This is a **critical** log type (ban/kick/timeout).'
        : '⬜ This is a **standard** log type. Use the 🚨 Critical Only toggle to limit pings to critical events.'),
    )
    .addFields(
      { name: 'ℹ️ Tip', value: 'Select **0 roles** to clear the current mention. Up to **5 roles** allowed.', inline: false },
    )
    .setFooter({ text: 'Changes save on role select • Use ← Cancel to go back without saving' });

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(LG.setmenroleS(type))
    .setPlaceholder('🔔 Select role(s) to mention...')
    .setMinValues(0)
    .setMaxValues(5);

  return {
    content: '',
    embeds:  [embed],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn('← Cancel', LG.type(type), ButtonStyle.Secondary),
      ),
    ],
  };
}

// ── Modals ─────────────────────────────────────────────────────────────────

export function buildSetChannelModal(type: LogType): ModalBuilder {
  const meta = LOG_TYPE_META[type];
  return new ModalBuilder()
    .setCustomId(LG.setchM(type))
    .setTitle(`Set Channel — ${meta.label}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('Channel ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click channel → Copy ID. Leave blank to clear.')
          .setRequired(false)
          .setMaxLength(20),
      ),
    );
}

export function buildSetColorModal(type: LogType, current?: number): ModalBuilder {
  const meta = LOG_TYPE_META[type];
  return new ModalBuilder()
    .setCustomId(LG.setcolorM(type))
    .setTitle(`Set Embed Color — ${meta.label}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Hex Color (e.g. #57f287 or 57f287)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(current !== undefined ? colorHex(current) : `Default: ${colorHex(meta.color)}`)
          .setRequired(false)
          .setMaxLength(7),
      ),
    );
}

export function buildSetMentionsModal(type: LogType, current?: string[]): ModalBuilder {
  const meta = LOG_TYPE_META[type];
  return new ModalBuilder()
    .setCustomId(LG.setmentionsM(type))
    .setTitle(`Mention Roles — ${meta.label}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('roleIds')
          .setLabel('Role IDs (comma-separated)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. 123456789, 987654321\nLeave blank to clear all mentions.')
          .setValue(current?.join(', ') ?? '')
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

export function buildSetIgnoreUsersModal(type: LogType, current?: string[]): ModalBuilder {
  const meta = LOG_TYPE_META[type];
  return new ModalBuilder()
    .setCustomId(LG.setignoreuM(type))
    .setTitle(`Ignore Users — ${meta.label}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('userIds')
          .setLabel('User IDs (comma-separated)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. 123456789, 987654321\nLeave blank to clear the ignore list.')
          .setValue(current?.join(', ') ?? '')
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

export function buildSetIgnoreRolesModal(type: LogType, current?: string[]): ModalBuilder {
  const meta = LOG_TYPE_META[type];
  return new ModalBuilder()
    .setCustomId(LG.setignorерM(type))
    .setTitle(`Ignore Roles — ${meta.label}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('roleIds')
          .setLabel('Role IDs (comma-separated)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. 123456789, 987654321\nLeave blank to clear the ignore list.')
          .setValue(current?.join(', ') ?? '')
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}
