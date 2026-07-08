import type { ConversationSession } from './types';

export class ConversationSummary {
  static readonly SUMMARIZE_THRESHOLD = 20;
  static readonly KEEP_AFTER_SUMMARY = 10;

  static shouldSummarize(session: ConversationSession): boolean {
    return session.messages.filter(m => m.role !== 'system').length >= this.SUMMARIZE_THRESHOLD;
  }

  static build(session: ConversationSession): string {
    const lines: string[] = ['[Earlier conversation summary]'];

    if (session.currentTask) {
      lines.push(`Task: ${session.currentTask}`);
      const done = session.taskSteps.filter(s => s.completed);
      const pending = session.taskSteps.filter(s => !s.completed);
      if (done.length) lines.push(`Completed:\n${done.map(s => `  ✓ ${s.description}`).join('\n')}`);
      if (pending.length) lines.push(`Remaining:\n${pending.map(s => `  • ${s.description}`).join('\n')}`);
    }

    if (session.objects.length > 0) {
      lines.push('Objects created this session:');
      for (const obj of session.objects.slice(-10)) {
        const parent = obj.parentName ? ` in "${obj.parentName}"` : '';
        lines.push(`  - ${obj.type} "${obj.name}"${parent}`);
      }
    }

    if (session.actions.length > 0) {
      lines.push('Recent actions:');
      for (const a of session.actions.slice(-5)) {
        lines.push(`  ${a.success ? '✓' : '✗'} ${a.toolName}: ${a.resultMessage}`);
      }
    }

    lines.push('[End of summary]');
    return lines.join('\n');
  }

  static trimIfNeeded(session: ConversationSession): void {
    const nonSystem = session.messages.filter(m => m.role !== 'system');
    if (nonSystem.length < this.SUMMARIZE_THRESHOLD) return;

    session.summary = this.build(session);
    session.messages = session.messages.slice(-this.KEEP_AFTER_SUMMARY);
  }
}
