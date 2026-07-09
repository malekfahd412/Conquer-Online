import type { Guild, GuildTextBasedChannel, Client } from 'discord.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ISpeechRecognizer } from './SpeechRecognizer';
import type { ISpeechSynthesizer } from './SpeechSynthesizer';
import type { VoicePlayer } from './VoicePlayer';
import type { UtteranceEvent } from './VoiceReceiver';
import { WakeWord } from './WakeWord';
import { LatencyMonitor } from './LatencyMonitor';
import { pcmToWav } from './SpeechRecognizer';
import type { MemoryManager } from '../ai/memory/MemoryManager';
import type { Planner } from '../ai/planner';
import type { ToolRegistry } from '../ai/tool-registry';
import type { Executor } from '../ai/executor';
import type { PromptBuilder } from '../ai/prompt-builder';
import type { ConversationMessage, ToolCall } from '../ai/types';
import { logger } from '../utils/logger';

export type VoicePersonality = 'friendly' | 'professional' | 'gaming' | 'funny' | 'assistant';

export interface VoiceAIComponents {
  memoryManager: MemoryManager;
  planner: Planner;
  toolRegistry: ToolRegistry;
  executor: Executor;
  promptBuilder: PromptBuilder;
}

const PERSONALITY_SUFFIXES: Record<VoicePersonality, string> = {
  friendly:     '\n\n## Voice Mode — Friendly\nYou are speaking out loud in a friendly, warm tone. Keep responses SHORT (1-2 sentences) and natural. No markdown, bullet points, or tool names in speech.',
  professional: '\n\n## Voice Mode — Professional\nYou are speaking out loud. Keep responses concise and professional (1-2 sentences). No markdown or internal tool names.',
  gaming:       '\n\n## Voice Mode — Gaming\nYou are the voice assistant for a gaming community. Be energetic and brief (1-2 sentences). Use natural gamer language. No markdown.',
  funny:        '\n\n## Voice Mode — Funny\nYou are speaking out loud. Be witty but brief (1-2 sentences). Keep it snappy. No markdown.',
  assistant:    '\n\n## Voice Mode\nYou are speaking out loud. Keep every response to 1-3 short sentences. No markdown, no bullet points, no internal tool names.',
};

const SESSION_TIMEOUT_MS = 30_000; // 30 seconds of inactivity → back to wake-word mode

export class VoiceConversation {
  private isActive = false;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;

  constructor(
    private readonly userId: string,
    private readonly guildId: string,
    private readonly guild: Guild,
    _client: Client, // reserved for future features (e.g. DM confirmations)
    private readonly player: VoicePlayer,
    private readonly recognizer: ISpeechRecognizer,
    private readonly synthesizer: ISpeechSynthesizer,
    private readonly ai: VoiceAIComponents,
    private readonly personality: VoicePersonality,
    private readonly confirmChannel: GuildTextBasedChannel | null,
    private readonly pendingButtons: Map<string, { userId: string; callback: () => Promise<void>; executing: boolean }>,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async processUtterance(evt: UtteranceEvent): Promise<void> {
    if (this.processing) return; // Don't overlap processing

    const latency = new LatencyMonitor();

    // 1. Speech-to-text
    latency.mark('stt_start');
    const wavBuffer = pcmToWav(evt.pcm);
    let text: string;
    try {
      text = await this.recognizer.recognize(wavBuffer);
    } catch (err) {
      logger.error('[VoiceConversation] STT failed', err);
      return;
    }
    latency.mark('stt_end');

    if (!text.trim()) return;
    logger.info(`[Voice:${this.userId}] STT: "${text}"`);

    // 2. Wake word handling
    if (!this.isActive) {
      if (!WakeWord.detect(text)) return;
      this.isActive = true;
      this.resetTimer();
      await this.say('Yes?', latency);
      return;
    }

    // 3. Goodbye detection
    if (WakeWord.isGoodbye(text)) {
      this.deactivate();
      await this.say('Goodbye!', latency);
      return;
    }

    this.resetTimer();
    this.processing = true;

    try {
      const cleanText = WakeWord.strip(text);
      await this.runAIPipeline(cleanText, latency);
    } finally {
      this.processing = false;
    }
  }

  get active(): boolean {
    return this.isActive;
  }

  destroy(): void {
    this.deactivate();
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────

  private async runAIPipeline(text: string, latency: LatencyMonitor): Promise<void> {
    // Add user message to shared memory
    this.ai.memoryManager.addUserMessage(this.userId, this.guildId, text);

    const messages = this.buildMessages();

    latency.mark('ai_start');
    let plan;
    try {
      plan = await this.ai.planner.plan(messages);
    } catch (err) {
      logger.error('[VoiceConversation] Planner failed', err);
      await this.say('Sorry, I had trouble understanding that. Please try again.', latency);
      return;
    }
    latency.mark('ai_end');

    if (plan.kind === 'text') {
      const msg: ConversationMessage = { role: 'assistant', content: plan.content };
      this.ai.memoryManager.addAssistantMessage(this.userId, this.guildId, msg);
      await this.say(plan.content, latency);
      return;
    }

    // Tool calls — check for dangerous ones
    const hasDangerous = plan.toolCalls.some(tc =>
      this.ai.toolRegistry.isDangerous(tc.function.name),
    );

    if (hasDangerous) {
      await this.handleDangerousTools(plan.toolCalls, latency);
      return;
    }

    // Execute safe tools immediately
    const assistantMsg: ConversationMessage = {
      role: 'assistant',
      content: null,
      tool_calls: plan.toolCalls,
    };
    this.ai.memoryManager.addAssistantMessage(this.userId, this.guildId, assistantMsg);

    const results = await this.ai.executor.execute(plan.toolCalls, this.guild);

    for (const result of results) {
      this.ai.memoryManager.addToolResult(
        this.userId, this.guildId, result.toolCallId,
        JSON.stringify({ success: result.success, message: result.message }),
      );
    }
    this.ai.memoryManager.processToolResults(this.userId, this.guildId, plan.toolCalls, results);

    // Final AI summary
    const finalPlan = await this.ai.planner.plan(this.buildMessages());
    let responseText: string;
    if (finalPlan.kind === 'text') {
      responseText = finalPlan.content;
      this.ai.memoryManager.addAssistantMessage(this.userId, this.guildId, {
        role: 'assistant',
        content: responseText,
      });
    } else {
      responseText = results.map(r => (r.success ? 'Done.' : `Failed: ${r.message}`)).join(' ');
    }

    await this.say(responseText, latency);
    latency.log(`[Voice:${this.userId}]`);
  }

  private async handleDangerousTools(
    toolCalls: ToolCall[],
    latency: LatencyMonitor,
  ): Promise<void> {
    if (this.confirmChannel) {
      // Post plan preview to text channel; tell user verbally
      const toolNames = toolCalls.map(tc => `\`${tc.function.name}\``).join(', ');
      await this.say(
        `This requires dangerous actions: ${toolCalls.map(tc => tc.function.name.replace(/_/g, ' ')).join(', ')}. Please confirm in the ${this.confirmChannel.name} channel.`,
        latency,
      );

      const confirmId = `voice-plan-${this.userId}-${Date.now()}`;
      const cancelId = `voice-cancel-${this.userId}-${Date.now()}`;

      const embed = new EmbedBuilder()
        .setColor(0xf5a623)
        .setTitle('⚠️ Voice AI — Dangerous Action Confirmation')
        .setDescription(`**Actions to execute:**\n${toolNames}`)
        .addFields({
          name: 'Requested by',
          value: `<@${this.userId}> via voice`,
          inline: true,
        })
        .setFooter({ text: 'Expires in 60 seconds' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel('✅ Execute').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary),
      );

      const msg = await this.confirmChannel.send({ embeds: [embed], components: [row] });

      await new Promise<void>(resolve => {
        const cleanup = (): void => {
          this.pendingButtons.delete(confirmId);
          this.pendingButtons.delete(cancelId);
        };

        const timeout = setTimeout(() => {
          cleanup();
          msg.edit({ components: [] }).catch(() => {});
          resolve();
        }, 60_000);

        const confirm = async (): Promise<void> => {
          cleanup();
          clearTimeout(timeout);
          await msg.edit({ components: [] }).catch(() => {});

          // Execute tools
          const assistantMsg: ConversationMessage = { role: 'assistant', content: null, tool_calls: toolCalls };
          this.ai.memoryManager.addAssistantMessage(this.userId, this.guildId, assistantMsg);
          const results = await this.ai.executor.execute(toolCalls, this.guild);
          for (const result of results) {
            this.ai.memoryManager.addToolResult(
              this.userId, this.guildId, result.toolCallId,
              JSON.stringify({ success: result.success, message: result.message }),
            );
          }
          this.ai.memoryManager.processToolResults(this.userId, this.guildId, toolCalls, results);

          const finalPlan = await this.ai.planner.plan(this.buildMessages());
          const responseText = finalPlan.kind === 'text'
            ? finalPlan.content
            : results.map(r => (r.success ? 'Done.' : `Failed: ${r.message}`)).join(' ');
          this.ai.memoryManager.addAssistantMessage(this.userId, this.guildId, { role: 'assistant', content: responseText });

          const newLatency = new LatencyMonitor();
          await this.say(responseText, newLatency);
          resolve();
        };

        this.pendingButtons.set(confirmId, { userId: this.userId, executing: false, callback: confirm });
        this.pendingButtons.set(cancelId, {
          userId: this.userId,
          executing: false,
          callback: async () => {
            cleanup();
            clearTimeout(timeout);
            await msg.edit({ components: [] }).catch(() => {});
            const newLatency = new LatencyMonitor();
            await this.say('Cancelled.', newLatency);
            resolve();
          },
        });
      });
    } else {
      // No text channel — decline with explanation
      await this.say(
        'I cannot execute dangerous actions without a confirmation channel. Please use the slash commands in the server chat instead.',
        latency,
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async say(text: string, latency: LatencyMonitor): Promise<void> {
    // Sanitize for TTS (remove markdown, trim to 500 chars for voice)
    const clean = sanitizeForTTS(text);
    if (!clean) return;

    logger.info(`[Voice:${this.userId}] TTS: "${clean.slice(0, 80)}${clean.length > 80 ? '…' : ''}"`);

    latency.mark('tts_start');
    let audioBuffer: Buffer;
    try {
      audioBuffer = await this.synthesizer.synthesize(clean);
    } catch (err) {
      logger.error('[VoiceConversation] TTS failed', err);
      return;
    }
    latency.mark('tts_end');

    if (audioBuffer.length === 0) return;
    await this.player.play(audioBuffer).catch(err => {
      logger.error('[VoiceConversation] Playback failed', err);
    });
  }

  private buildMessages(): ConversationMessage[] {
    const memCtx = this.ai.memoryManager.buildContextText(this.userId, this.guildId);
    const systemPrompt = this.ai.promptBuilder.build(memCtx) +
      (PERSONALITY_SUFFIXES[this.personality] ?? PERSONALITY_SUFFIXES.assistant);
    return [
      { role: 'system', content: systemPrompt },
      ...this.ai.memoryManager.getMessages(this.userId, this.guildId),
    ];
  }

  private resetTimer(): void {
    if (this.activeTimer) clearTimeout(this.activeTimer);
    this.activeTimer = setTimeout(() => {
      if (this.isActive) {
        this.isActive = false;
        logger.info(`[Voice:${this.userId}] Session timed out after inactivity`);
      }
    }, SESSION_TIMEOUT_MS);
  }

  private deactivate(): void {
    this.isActive = false;
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
  }
}

function sanitizeForTTS(text: string): string {
  return text
    .replace(/\*\*/g, '')                  // bold
    .replace(/\*/g, '')                    // italic
    .replace(/#{1,6}\s/g, '')             // headers
    .replace(/`{1,3}[^`]*`{1,3}/g, '')   // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/<[^>]+>/g, '')              // HTML tags
    .replace(/\n{2,}/g, '. ')            // double newlines → pause
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500);
}
