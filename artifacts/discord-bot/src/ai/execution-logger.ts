import { EmbedBuilder } from 'discord.js';
import type { Client, GuildTextBasedChannel } from 'discord.js';
import type { ExecutionLog } from './types';
import { logger } from '../utils/logger';

export class ExecutionLogger {
  constructor(private readonly logChannelId: string | undefined) {}

  async log(log: ExecutionLog, client: Client): Promise<void> {
    if (!this.logChannelId) return;

    try {
      const channel = await client.channels.fetch(this.logChannelId);
      if (!channel?.isTextBased() || !channel.isSendable()) return;
      const guildChannel = channel as GuildTextBasedChannel;

      const successCount = log.toolsExecuted.filter(r => r.success).length;
      const totalCount = log.toolsExecuted.length;
      const color = log.success ? 0x00d26a : 0xff3b30;

      const actionsValue = totalCount > 0
        ? log.toolsExecuted
            .map(r => `${r.success ? '✅' : '❌'} \`${r.toolName}\` — ${r.message}`)
            .join('\n')
            .slice(0, 1024)
        : 'No actions executed';

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🤖 AI Control Center — Execution Log')
        .addFields(
          { name: '👤 User', value: `${log.username} (<@${log.userId}>)`, inline: true },
          { name: '⏱️ Duration', value: `${log.durationMs}ms`, inline: true },
          { name: '📊 Result', value: `${successCount}/${totalCount} actions succeeded`, inline: true },
          { name: '💬 Prompt', value: log.prompt.slice(0, 1024), inline: false },
          { name: '⚙️ Actions', value: actionsValue, inline: false },
        )
        .setTimestamp(log.timestamp)
        .setFooter({ text: 'AI Control Center' });

      await guildChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.warning('Failed to write AI execution log', error);
    }
  }
}
