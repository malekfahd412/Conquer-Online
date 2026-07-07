import { EmbedBuilder, type APIEmbed } from 'discord.js';
import type { ServerStatus, ActiveEvent } from '../types/server-status';

const COLORS = {
  online: 0x00d26a,
  maintenance: 0xf5a623,
  offline: 0xff3b30,
  connecting: 0x8e8e93,
} as const;

const STATUS_LABELS = {
  online: '🟢 Online',
  maintenance: '🟡 Maintenance',
  offline: '🔴 Offline',
  connecting: '⏳ Waiting for Server Connection',
} as const;

const PROGRESS_BAR_WIDTH = 14;

function buildProgressBar(current: number, max: number): string {
  if (max <= 0) return '░'.repeat(PROGRESS_BAR_WIDTH);
  const ratio = Math.min(current / max, 1);
  const filled = Math.round(ratio * PROGRESS_BAR_WIDTH);
  const empty = PROGRESS_BAR_WIDTH - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function buildActiveEventsField(events: ActiveEvent[]): string {
  if (events.length === 0) return 'No active events';

  return events
    .slice(0, 3)
    .map(e => {
      const icon = e.status === 'active' ? '🟢' : '🟡';
      const label = e.status === 'starting_soon' && e.startsIn ? ` — starts in ${e.startsIn}` : '';
      return `${icon} ${e.name}${label}`;
    })
    .join('\n');
}

function buildUpcomingEventsField(events: ServerStatus['upcomingEvents']): string {
  if (events.length === 0) return 'No upcoming events';

  return events
    .map(e => `**${e.name}** — ${e.scheduledTime}`)
    .join('\n');
}

export interface EmbedOptions {
  serverLogoUrl: string | undefined;
}

export function buildStatusEmbed(status: ServerStatus, options: EmbedOptions): APIEmbed {
  const color = COLORS[status.status];
  const embed = new EmbedBuilder().setColor(color);

  embed.setAuthor({
    name: '⚔️ Conquer Online',
    iconURL: options.serverLogoUrl,
  });

  embed.setTitle('Live Server Status');

  if (options.serverLogoUrl) {
    embed.setThumbnail(options.serverLogoUrl);
  }

  if (status.status === 'connecting') {
    embed.setDescription(
      '```\nWaiting for Server Connection...\n```\n' +
      'The bot is live. Data will appear once the game server is reachable.',
    );
    embed.setFooter({ text: 'Powered by Conquer Online' });
    embed.setTimestamp(status.lastUpdate);
    return embed.toJSON();
  }

  const progressBar = buildProgressBar(status.playersOnline, status.maxPlayers);
  const percentOnline =
    status.maxPlayers > 0
      ? Math.round((status.playersOnline / status.maxPlayers) * 100)
      : 0;

  embed.addFields(
    {
      name: 'Server Overview',
      value: [
        `**${STATUS_LABELS[status.status]}**`,
        '',
        `👥  **Players Online**`,
        `\`${formatNumber(status.playersOnline)} / ${formatNumber(status.maxPlayers)}\``,
        `\`${progressBar}\` ${percentOnline}%`,
        '',
        `📊  **Total Accounts**  —  ${formatNumber(status.totalAccounts)}`,
        `📈  **Peak Today**  —  ${formatNumber(status.peakToday)}`,
        `🏆  **Record Online**  —  ${formatNumber(status.recordOnline)}`,
        `⏳  **Uptime**  —  ${status.uptime}`,
      ].join('\n'),
      inline: false,
    },
    {
      name: 'Active Events',
      value: buildActiveEventsField(status.activeEvents),
      inline: true,
    },
    {
      name: 'Next Events',
      value: buildUpcomingEventsField(status.upcomingEvents),
      inline: true,
    },
  );

  embed.setFooter({ text: 'Powered by Conquer Online' });
  embed.setTimestamp(status.lastUpdate);

  return embed.toJSON();
}
