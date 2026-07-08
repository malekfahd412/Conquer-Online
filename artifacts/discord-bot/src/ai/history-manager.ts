import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const MAX_HISTORY_PER_CHANNEL = 20;

export class HistoryManager {
  private readonly histories = new Map<string, ChatCompletionMessageParam[]>();

  getHistory(channelId: string): ChatCompletionMessageParam[] {
    return this.histories.get(channelId) ?? [];
  }

  addUserMessage(channelId: string, content: string): void {
    this.push(channelId, { role: 'user', content });
  }

  addAssistantMessage(
    channelId: string,
    message: ChatCompletionMessageParam,
  ): void {
    this.push(channelId, message);
  }

  addToolResult(
    channelId: string,
    toolCallId: string,
    content: string,
  ): void {
    this.push(channelId, { role: 'tool', tool_call_id: toolCallId, content });
  }

  clearChannel(channelId: string): void {
    this.histories.delete(channelId);
  }

  private push(channelId: string, message: ChatCompletionMessageParam): void {
    const history = this.histories.get(channelId) ?? [];
    history.push(message);

    if (history.length > MAX_HISTORY_PER_CHANNEL) {
      history.splice(1, history.length - MAX_HISTORY_PER_CHANNEL);
    }

    this.histories.set(channelId, history);
  }
}
