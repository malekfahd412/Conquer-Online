import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { ALL_LOG_TYPES, EVENT_LOG_TYPES, LOG_TYPE_META, type LogType, type GuildLogConfig } from '../../../discord/logging/log-store';
import { LG } from './lg-ids';
import { CC } from '../cc-ids';

type AnyRow = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

export interface LGPayload {
  content: string;
  embeds: EmbedBuilder[];
  components: AnyRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function btn(label: string, id: string, style: ButtonStyle, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setLabel(label).setCustomId(id).setStyle(style).setDisabled(disabled);
}

function backRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('← Logs', LG.DASH, ButtonStyle.Secondary),
    btn('🏠 Home', CC.HOME, ButtonStyle.Secondary),
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export function buildLogsDashboard(cfg: GuildLogConfig): LGPayload {
  const lines: string[] = [];

  for (const type of EVENT_LOG_TYPES) {
    const meta = LOG_TYPE_META[type];
    const typeCfg = cfg.types[type];
    const status = typeCfg?.enabled ? '✅' : '❌';
    const ch = typeCfg?.channelId ? `<#${typeCfg.channelId}>` : '_none_';
    lines.push(`${status} ${meta.emoji} **${meta.label}** — ${ch}`);
  }

  // Fallback channel (logs_all)
  const allCfg = cfg.types['logs_all'];
  const allStatus = allCfg?.enabled ? '✅' : '❌';
  const allCh = allCfg?.channelId ? `<#${allCfg.channelId}>` : '_none_';

  const embed = new EmbedBuilder()
    .setColor(0x99aab5)
    .setTitle('📋 Logs Manager')
    .setDescription(lines.join('\n'))
    .addFields({
      name: `${allStatus} 📋 Logs All Server (fallback)`,
      value: `Channel: ${allCh}\nAll enabled log types without their own channel will be sent here.`,
    })
    .setFooter({ text: 'Select a log type below to configure it • All changes save instantly' });

  const select = new StringSelectMenuBuilder()
    .setCustomId(LG.TYPESEL)
    .setPlaceholder('⚙️ Configure a log type...')
    .addOptions(
      ALL_LOG_TYPES.map(t => {
        const m = LOG_TYPE_META[t];
        const tc = cfg.types[t];
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${m.emoji} ${m.label}`)
          .setDescription(m.description)
          .setValue(t)
          .setDefault(false);
      }),
    );

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn('🏠 Home', CC.HOME, ButtonStyle.Secondary),
      ),
    ],
  };
}

// ── Type Detail ────────────────────────────────────────────────────────────

export function buildLogTypeDetail(type: LogType, cfg: GuildLogConfig): LGPayload {
  const meta = LOG_TYPE_META[type];
  const typeCfg = cfg.types[type] ?? { enabled: false };
  const isEnabled = typeCfg.enabled;
  const channelId = typeCfg.channelId;
  const isLogsAll = type === 'logs_all';

  const fallbackCfg = cfg.types['logs_all'];
  const fallbackDesc = isLogsAll
    ? 'This is the fallback channel. All enabled log types without a dedicated channel will be sent here.'
    : (channelId
      ? `Events will be sent to <#${channelId}>.`
      : (fallbackCfg?.enabled && fallbackCfg.channelId
        ? `No dedicated channel set — events will fall back to <#${fallbackCfg.channelId}> (Logs All Server).`
        : 'No channel configured. Set a channel or configure Logs All Server as a fallback.'));

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setDescription(meta.description)
    .addFields(
      { name: '🔘 Status', value: isEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: '📢 Channel', value: channelId ? `<#${channelId}>` : '_not set_', inline: true },
      { name: '📌 Routing', value: fallbackDesc, inline: false },
    )
    .setFooter({ text: 'Use Test Log to verify the channel is receiving events' });

  const toggleLabel = isEnabled ? '❌ Disable' : '✅ Enable';
  const toggleStyle = isEnabled ? ButtonStyle.Danger : ButtonStyle.Success;
  const canTest = isEnabled && (channelId || (fallbackCfg?.enabled && fallbackCfg.channelId));

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(toggleLabel,       LG.toggle(type),  toggleStyle),
    btn('📢 Set Channel',  LG.setch(type),   ButtonStyle.Primary),
    btn('👁️ Preview',      LG.preview(type), ButtonStyle.Secondary),
    btn('🧪 Test Log',     LG.test(type),    ButtonStyle.Secondary, !canTest),
  );

  return {
    content: '',
    embeds: [embed],
    components: [row1, backRow()],
  };
}

// ── Set-Channel Modal ──────────────────────────────────────────────────────

export function buildSetChannelModal(type: LogType): ModalBuilder {
  const meta = LOG_TYPE_META[type];
  const input = new TextInputBuilder()
    .setCustomId('channelId')
    .setLabel('Channel ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Paste the channel ID here (right-click channel → Copy ID). Leave blank to clear.')
    .setRequired(false)
    .setMaxLength(20);

  return new ModalBuilder()
    .setCustomId(LG.setchM(type))
    .setTitle(`Set Channel — ${meta.label}`)
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}
