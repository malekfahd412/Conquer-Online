import type { ConversationSession, UserPreferences } from './types';

export class ReferenceResolver {
  static buildContextText(session: ConversationSession, prefs: UserPreferences | null): string {
    const parts: string[] = [];

    // Task context
    if (session.currentTask) {
      const lines = [`Current Task: ${session.currentTask}`];
      const done = session.taskSteps.filter(s => s.completed);
      const pending = session.taskSteps.filter(s => !s.completed);
      if (done.length) lines.push(`  Completed: ${done.map(s => s.description).join(', ')}`);
      if (pending.length) lines.push(`  Remaining: ${pending.map(s => s.description).join(', ')}`);
      parts.push(lines.join('\n'));
    }

    // Pronoun resolution context
    const ctx = session.context;
    const focus: string[] = [];

    if (ctx.lastObject) {
      const obj = ctx.lastObject;
      const parent = obj.parentName ? ` in "${obj.parentName}"` : '';
      focus.push(`Most recent object: ${obj.type} "${obj.name}"${parent} — this is what "it", "this", "that" most likely refers to.`);
    }
    if (ctx.category) focus.push(`Focused category: "${ctx.category.name}"${ctx.category.id ? ` (ID: ${ctx.category.id})` : ''}`);
    if (ctx.channel) focus.push(`Focused channel: "#${ctx.channel.name}"${ctx.channel.id ? ` (ID: ${ctx.channel.id})` : ''}`);
    if (ctx.role) focus.push(`Focused role: "${ctx.role.name}"${ctx.role.id ? ` (ID: ${ctx.role.id})` : ''}`);

    if (focus.length > 0) {
      parts.push(`Reference resolution (resolve "it", "this", "that", "there" from this context):\n${focus.map(l => `  ${l}`).join('\n')}`);
    }

    // Object registry
    if (session.objects.length > 0) {
      const objLines = session.objects.slice(-15).map(obj => {
        const parent = obj.parentName ? ` in "${obj.parentName}"` : '';
        const id = obj.id ? ` (ID: ${obj.id})` : '';
        return `  - ${obj.type} "${obj.name}"${parent}${id}`;
      });
      parts.push(`Objects created this session:\n${objLines.join('\n')}`);
    }

    // Conversation summary from earlier
    if (session.summary) {
      parts.push(session.summary);
    }

    // Long-term preferences
    if (prefs) {
      const prefLines: string[] = [];
      if (prefs.language) prefLines.push(`  Language: ${prefs.language}`);
      if (prefs.channelNaming) prefLines.push(`  Channel naming style: ${prefs.channelNaming}`);
      if (prefs.roleNaming) prefLines.push(`  Role naming style: ${prefs.roleNaming}`);
      if (prefs.announcementStyle) prefLines.push(`  Announcement style: ${prefs.announcementStyle}`);
      if (prefs.embedColor !== undefined) prefLines.push(`  Embed color: #${prefs.embedColor.toString(16).padStart(6, '0').toUpperCase()}`);
      if (prefs.ticketLayout) prefLines.push(`  Ticket layout: ${prefs.ticketLayout}`);
      if (prefs.categoryStructure) prefLines.push(`  Category structure: ${prefs.categoryStructure}`);
      if (prefLines.length > 0) {
        parts.push(`User preferences (apply these automatically):\n${prefLines.join('\n')}`);
      }
    }

    return parts.join('\n\n');
  }
}
