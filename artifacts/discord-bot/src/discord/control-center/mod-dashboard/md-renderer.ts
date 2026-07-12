import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { GuildModConfig } from '../../../community/moderation/types';
import { formatDuration, DEFAULT_AUTO_PUNISH } from '../../../community/moderation/types';
import { MD } from './md-ids';
import { CC } from '../cc-ids';

type AnyRow =
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<RoleSelectMenuBuilder>;

export interface MDPayload {
  content: string;
  embeds: EmbedBuilder[];
  components: AnyRow[];
}

function btn(
  label: string,
  id: string,
  style: ButtonStyle,
  disabled = false,
): ButtonBuilder {
  return new ButtonBuilder().setLabel(label).setCustomId(id).setStyle(style).setDisabled(disabled);
}

function nav(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🏠 Home', CC.HOME, ButtonStyle.Secondary),
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export function buildModDashboard(cfg: GuildModConfig): MDPayload {
  const ap = cfg.autoPunish;
  const thresholdLines = ap.thresholds
    .sort((a, b) => a.warns - b.warns)
    .map(t => {
      const dur = t.duration ? ` (${formatDuration(t.duration)})` : '';
      return `• **${t.warns}** warnings → ${t.action}${dur}`;
    });

  const rolesValue = cfg.modRoles.length
    ? cfg.modRoles.map(id => `<@&${id}>`).join(' ')
    : '_None configured — only Administrators can use mod commands_';

  const reasonLines = Object.entries(cfg.defaultReasons)
    .filter(([, v]) => v)
    .map(([k, v]) => `\`${k}\`: ${v}`);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔨 Moderation System Pro')
    .setDescription('Configure moderation settings for this server.')
    .addFields(
      {
        name: `🤖 Auto-Punishment — ${ap.enabled ? '✅ Enabled' : '❌ Disabled'}`,
        value: thresholdLines.length ? thresholdLines.join('\n') : '_No thresholds configured_',
        inline: false,
      },
      {
        name: '🛡️ Mod Roles',
        value: rolesValue,
        inline: false,
      },
      {
        name: '💬 DM on Punishment',
        value: cfg.dmOnPunish ? '✅ Yes — users are DMed when punished' : '❌ No — users are not DMed',
        inline: true,
      },
      {
        name: '📋 Case Prefix',
        value: `\`${cfg.casePrefix}\` (next: \`${cfg.casePrefix}-${String(cfg.nextCaseNumber).padStart(4, '0')}\`)`,
        inline: true,
      },
      {
        name: '📝 Default Reasons',
        value: reasonLines.length ? reasonLines.join('\n') : '_No defaults set_',
        inline: false,
      },
    )
    .setFooter({ text: 'Changes apply to all future mod actions' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(ap.enabled ? '🤖 Auto-Punish: ON' : '🤖 Auto-Punish: OFF', MD.TOGGLE_AUTOPUNISH,
      ap.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
    btn('⚙️ Configure Thresholds', MD.SET_AUTOPUNISH, ButtonStyle.Primary),
    btn(cfg.dmOnPunish ? '💬 DM: ON' : '💬 DM: OFF', MD.TOGGLE_DM,
      cfg.dmOnPunish ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🛡️ Set Mod Roles', MD.CFG_ROLES, ButtonStyle.Primary),
    btn('📝 Default Reasons', MD.SET_REASONS, ButtonStyle.Secondary),
    btn('📋 Set Case Prefix', MD.SET_PREFIX, ButtonStyle.Secondary),
  );

  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(MD.ROLE_SEL)
      .setPlaceholder('🛡️ Select moderator roles (up to 10)...')
      .setMinValues(0)
      .setMaxValues(10),
  );

  return { content: '', embeds: [embed], components: [row1, row2, roleRow, nav()] };
}

// ── Modals ─────────────────────────────────────────────────────────────────

export function buildAutoPunishModal(cfg: GuildModConfig): ModalBuilder {
  const t = [...cfg.autoPunish.thresholds].sort((a, b) => a.warns - b.warns);
  const def = DEFAULT_AUTO_PUNISH.thresholds;

  const lines = t.length
    ? t.map(th => {
        const dur = th.duration ? ` ${formatDuration(th.duration)}` : '';
        return `${th.warns} ${th.action}${dur}`;
      }).join('\n')
    : def.map(th => {
        const dur = th.duration ? ` ${formatDuration(th.duration)}` : '';
        return `${th.warns} ${th.action}${dur}`;
      }).join('\n');

  return new ModalBuilder()
    .setCustomId(MD.SET_AUTOPUNISH_M)
    .setTitle('Configure Auto-Punishment Thresholds')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('thresholds')
          .setLabel('Thresholds (one per line)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(
            '3 timeout 1h\n5 kick\n7 ban\n\nFormat: <warns> <timeout|kick|ban> [duration]',
          )
          .setValue(lines)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
}

export function buildPrefixModal(cfg: GuildModConfig): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(MD.SET_PREFIX_M)
    .setTitle('Set Case ID Prefix')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('prefix')
          .setLabel('Prefix (e.g. MOD, CASE, WARN)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('MOD')
          .setValue(cfg.casePrefix)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(8),
      ),
    );
}

export function buildReasonsModal(cfg: GuildModConfig): ModalBuilder {
  const reasons = cfg.defaultReasons;
  const lines = [
    `warn: ${reasons.warn ?? ''}`,
    `mute: ${reasons.mute ?? ''}`,
    `kick: ${reasons.kick ?? ''}`,
    `ban: ${reasons.ban ?? ''}`,
    `tempban: ${reasons.tempban ?? ''}`,
  ].join('\n');

  return new ModalBuilder()
    .setCustomId(MD.SET_REASONS_M)
    .setTitle('Set Default Reasons')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reasons')
          .setLabel('Default reasons (format: action: reason)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('warn: Breaking server rules\nmute: Disruptive behaviour\nkick: Warned multiple times\nban: Severe violation\ntempban: Temporary removal')
          .setValue(lines)
          .setRequired(false)
          .setMaxLength(800),
      ),
    );
}
