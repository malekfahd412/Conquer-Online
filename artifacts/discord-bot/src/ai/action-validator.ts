import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Interaction,
  type Message,
} from 'discord.js';
import type { ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
import type { ToolRegistry } from './tool-registry';
import { logger } from '../utils/logger';

type ConfirmCallback = () => Promise<void>;

export class ActionValidator {
  private readonly pending = new Map<string, ConfirmCallback>();

  constructor(private readonly toolRegistry: ToolRegistry) {}

  hasDangerousActions(toolCalls: ChatCompletionMessageToolCall[]): boolean {
    return toolCalls.some(tc => this.toolRegistry.isDangerous(tc.function.name));
  }

  async requestConfirmation(
    message: Message,
    toolCalls: ChatCompletionMessageToolCall[],
    onConfirm: (toolCalls: ChatCompletionMessageToolCall[]) => Promise<void>,
  ): Promise<void> {
    const dangerous = toolCalls.filter(tc => this.toolRegistry.isDangerous(tc.function.name));

    const actionLines = dangerous.map(tc => {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* ignore */ }
      const desc = this.toolRegistry.getDangerDescription(tc.function.name);
      const paramStr = Object.entries(args).map(([k, v]) => `${k}: **${String(v)}**`).join(', ');
      return `• \`${tc.function.name}\`${paramStr ? ` — ${paramStr}` : ''}\n  _${desc}_`;
    }).join('\n');

    const confirmId = `ai-confirm-${message.id}`;
    const cancelId = `ai-cancel-${message.id}`;

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle(`⚠️ Confirm — ${dangerous.length} Dangerous Action${dangerous.length > 1 ? 's' : ''}`)
      .setDescription(`The following action${dangerous.length > 1 ? 's' : ''} will be executed:\n\n${actionLines}`)
      .setFooter({ text: 'This confirmation expires in 60 seconds.' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('✅  Confirm').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel('❌  Cancel').setStyle(ButtonStyle.Secondary),
    );

    const reply = await message.reply({ embeds: [embed], components: [row] });

    const cleanup = (): void => {
      this.pending.delete(confirmId);
      this.pending.delete(cancelId);
    };

    const capturedToolCalls = toolCalls;
    this.pending.set(confirmId, async () => {
      cleanup();
      try {
        await reply.edit({ embeds: [embed.setColor(0x00d26a).setTitle('✅ Confirmed — Executing...')], components: [] });
        await onConfirm(capturedToolCalls);
      } catch (error) {
        logger.error('Error during confirmed execution', error);
      }
    });

    this.pending.set(cancelId, async () => {
      cleanup();
      await reply.edit({
        embeds: [embed.setColor(0x8e8e93).setTitle('❌ Action Cancelled').setFooter({ text: '' })],
        components: [],
      });
    });

    setTimeout(() => {
      if (this.pending.has(confirmId)) {
        cleanup();
        reply.edit({ components: [] }).catch(() => {});
      }
    }, 60_000);

    logger.info(`Confirmation requested for: ${dangerous.map(t => t.function.name).join(', ')}`);
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const handler = this.pending.get(interaction.customId);
    if (!handler) return;

    await interaction.deferUpdate();
    await handler();
  }
}
