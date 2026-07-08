import type { Client, Message, GuildTextBasedChannel } from 'discord.js';
import type { ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { PermissionManager } from './permission-manager';
import { HistoryManager } from './history-manager';
import { ToolRegistry } from './tool-registry';
import { PromptBuilder } from './prompt-builder';
import { Planner } from './planner';
import { Executor } from './executor';
import { ActionValidator } from './action-validator';
import { ExecutionLogger } from './execution-logger';
import type { ToolResult } from './types';
import { logger } from '../utils/logger';

export interface AIConfig {
  serverName: string;
  adminRole: string;
  logChannelId: string | undefined;
  chatChannelId: string | undefined;
}

export class AIService {
  private readonly permissionManager: PermissionManager;
  private readonly historyManager: HistoryManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly promptBuilder: PromptBuilder;
  private readonly planner: Planner;
  private readonly executor: Executor;
  private readonly actionValidator: ActionValidator;
  private readonly executionLogger: ExecutionLogger;

  constructor(private readonly config: AIConfig) {
    this.permissionManager = new PermissionManager(config.adminRole);
    this.historyManager = new HistoryManager();
    this.toolRegistry = new ToolRegistry();
    this.promptBuilder = new PromptBuilder(config.serverName);
    this.planner = new Planner(this.toolRegistry);
    this.executor = new Executor(this.toolRegistry);
    this.actionValidator = new ActionValidator(this.toolRegistry);
    this.executionLogger = new ExecutionLogger(config.logChannelId);
  }

  start(client: Client): void {
    client.on('messageCreate', message => {
      this.onMessage(message, client).catch(error => {
        logger.error('AI message handler error', error);
      });
    });

    client.on('interactionCreate', interaction => {
      this.actionValidator.handleInteraction(interaction).catch(error => {
        logger.error('AI interaction handler error', error);
      });
    });

    logger.success('AI Control Center is active');
    if (this.config.adminRole) {
      logger.info(`AI admin role: "${this.config.adminRole}"`);
    }
    if (this.config.chatChannelId) {
      logger.info(`AI chat channel: ${this.config.chatChannelId}`);
    }
    if (!this.config.logChannelId) {
      logger.warning('CHANNEL_AI_LOG not set — execution logs will not be posted');
    }
  }

  private async onMessage(message: Message, client: Client): Promise<void> {
    if (message.author.bot) return;
    if (!message.guild) return;

    const botUser = client.user;
    if (!botUser) return;

    const inAiChannel = this.config.chatChannelId
      ? message.channelId === this.config.chatChannelId
      : false;
    const mentionsBot = message.mentions.has(botUser.id);

    if (!inAiChannel && !mentionsBot) return;

    const member = message.member ?? await message.guild.members.fetch(message.author.id);
    if (!this.permissionManager.isAdmin(member)) {
      logger.info(`Ignored message from non-admin: ${message.author.tag}`);
      return;
    }

    const content = message.content
      .replace(`<@${botUser.id}>`, '')
      .replace(`<@!${botUser.id}>`, '')
      .trim();

    if (!content) return;

    const startTime = Date.now();
    logger.info(`AI request from ${message.author.tag}: "${content}"`);

    let typingInterval: ReturnType<typeof setInterval> | null = null;
    if (message.guild && message.channel.isTextBased()) {
      const guildChannel = message.channel as GuildTextBasedChannel;
      await guildChannel.sendTyping().catch(() => {});
      typingInterval = setInterval(() => {
        (message.channel as GuildTextBasedChannel).sendTyping().catch(() => {});
      }, 8_000);
    }

    const stopTyping = (): void => {
      if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
    };

    try {
      this.historyManager.addUserMessage(message.channelId, content);

      const history = this.historyManager.getHistory(message.channelId);
      const systemPrompt = this.promptBuilder.build();
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history,
      ];

      const plan = await this.planner.plan(messages);

      if (plan.kind === 'text') {
        stopTyping();
        this.historyManager.addAssistantMessage(message.channelId, { role: 'assistant', content: plan.content });
        await message.reply({ content: plan.content });
        return;
      }

      if (this.actionValidator.hasDangerousActions(plan.toolCalls)) {
        stopTyping();
        await this.actionValidator.requestConfirmation(
          message,
          plan.toolCalls,
          async (toolCalls) => {
            await this.executeAndRespond(message, toolCalls, content, startTime, member.user.tag, client);
          },
        );
        return;
      }

      stopTyping();
      await this.executeAndRespond(message, plan.toolCalls, content, startTime, member.user.tag, client);
    } catch (error) {
      stopTyping();
      logger.error('AI execution error', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await message.reply(`❌ An error occurred: ${errMsg}`).catch(() => {});
    }
  }

  private async executeAndRespond(
    message: Message,
    toolCalls: ChatCompletionMessageToolCall[],
    prompt: string,
    startTime: number,
    username: string,
    client: Client,
  ): Promise<void> {
    const results: ToolResult[] = await this.executor.execute(toolCalls, message.guild!);

    const assistantMsg: ChatCompletionMessageParam = {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls,
    };
    this.historyManager.addAssistantMessage(message.channelId, assistantMsg);

    for (const result of results) {
      this.historyManager.addToolResult(
        message.channelId,
        result.toolCallId,
        JSON.stringify({ success: result.success, message: result.message }),
      );
    }

    const updatedHistory = this.historyManager.getHistory(message.channelId);
    const finalPlan = await this.planner.plan([
      { role: 'system', content: this.promptBuilder.build() },
      ...updatedHistory,
    ]);

    let responseText: string;
    if (finalPlan.kind === 'text') {
      responseText = finalPlan.content;
      this.historyManager.addAssistantMessage(message.channelId, { role: 'assistant', content: responseText });
    } else {
      responseText = results.map(r => `${r.success ? '✅' : '❌'} ${r.message}`).join('\n');
    }

    await message.reply({ content: responseText }).catch(error => {
      logger.error('Failed to send AI response', error);
    });

    const success = results.every(r => r.success);
    await this.executionLogger.log(
      {
        userId: message.author.id,
        username,
        prompt,
        toolsExecuted: results,
        success,
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      },
      client,
    );
  }
}
