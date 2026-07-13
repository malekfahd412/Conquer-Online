import { EmbedBuilder } from 'discord.js';
import type { StaffProfile } from './types';

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return '0m';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function buildShiftEmbed(action: 'started' | 'ended', profile: StaffProfile, durationMs?: number): EmbedBuilder {
  if (action === 'started') {
    return new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🟢 Shift Started')
      .setDescription('Your shift has begun. Use `/shift end` when you\'re done.')
      .setTimestamp();
  }
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔴 Shift Ended')
    .setDescription(`Shift duration: **${formatDurationMs(durationMs ?? 0)}**`)
    .addFields({ name: 'Total Tracked Activity', value: formatDurationMs(profile.totalActivityMs), inline: true })
    .setTimestamp();
}

export function buildShiftStatusEmbed(profile: StaffProfile | undefined): EmbedBuilder {
  const onShift = !!profile?.currentShiftStartedAt;
  const embed = new EmbedBuilder()
    .setColor(onShift ? 0x57f287 : 0x99aab5)
    .setTitle('👮 Shift Status')
    .addFields(
      { name: 'Currently On Shift', value: onShift ? '🟢 Yes' : '⚪ No', inline: true },
      { name: 'Total Tracked Activity', value: formatDurationMs(profile?.totalActivityMs ?? 0), inline: true },
    );
  if (onShift && profile?.currentShiftStartedAt) {
    embed.addFields({ name: 'Current Shift Started', value: `<t:${Math.floor(profile.currentShiftStartedAt / 1000)}:R>`, inline: false });
  }
  return embed;
}
