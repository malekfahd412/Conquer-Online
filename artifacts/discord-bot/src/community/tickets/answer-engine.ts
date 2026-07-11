// ─────────────────────────────────────────────────────────────────────────────
// AnswerEngine — stores Question/Form Builder submissions.
//
// Deliberately separate from TicketRecord.answers (ticket-engine.ts / tickets.json):
// a form submission is a durable record in its own right (admins may want to
// search/export/delete/audit answers independent of ticket lifecycle — a
// closed or deleted ticket must not take its answers with it). Owns
// data/tickets/answers.json exclusively.
// ─────────────────────────────────────────────────────────────────────────────
import { JsonStore, genId } from './store';
import type { FormAnswerRecord, FormAnswerAuditEntry, FormAnswerAuditAction, FormAnswerItem } from './types';

interface AnswerData {
  answers: FormAnswerRecord[];
  audit: FormAnswerAuditEntry[];
}

const store = new JsonStore<AnswerData>('answers.json', () => ({ answers: [], audit: [] }));

export interface RecordAnswerInput {
  guildId: string;
  panelId: string;
  panelName: string;
  formId: string;
  formName: string;
  ticketType: string;
  ticketId?: string;
  channelId?: string;
  userId: string;
  userTag: string;
  answers: FormAnswerItem[];
}

export interface AnswerSearchFilters {
  query?: string;
  panelId?: string;
  formId?: string;
  userId?: string;
  from?: number;
  to?: number;
}

export class AnswerEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  async record(input: RecordAnswerInput): Promise<FormAnswerRecord> {
    return store.mutate(data => {
      const record: FormAnswerRecord = { ...input, id: genId('answer'), submittedAt: Date.now() };
      data.answers.push(record);
      this.pushAudit(data, { guildId: input.guildId, action: 'created', actorId: input.userId, answerId: record.id, detail: `Form "${input.formName}" submitted` });
      return record;
    });
  }

  async get(id: string): Promise<FormAnswerRecord | undefined> {
    const data = await store.read();
    return data.answers.find(a => a.id === id);
  }

  async linkTicket(answerId: string, ticketId: string, channelId: string): Promise<void> {
    await store.mutate(data => {
      const rec = data.answers.find(a => a.id === answerId);
      if (rec) {
        rec.ticketId = ticketId;
        rec.channelId = channelId;
      }
    });
  }

  async search(guildId: string, filters: AnswerSearchFilters = {}, limit = 25, offset = 0): Promise<{ results: FormAnswerRecord[]; total: number }> {
    const data = await store.read();
    let results = data.answers.filter(a => a.guildId === guildId);

    if (filters.panelId) results = results.filter(a => a.panelId === filters.panelId);
    if (filters.formId) results = results.filter(a => a.formId === filters.formId);
    if (filters.userId) results = results.filter(a => a.userId === filters.userId);
    if (filters.from !== undefined) results = results.filter(a => a.submittedAt >= filters.from!);
    if (filters.to !== undefined) results = results.filter(a => a.submittedAt <= filters.to!);
    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(a =>
        a.userTag.toLowerCase().includes(q) ||
        a.formName.toLowerCase().includes(q) ||
        a.panelName.toLowerCase().includes(q) ||
        a.answers.some(item => item.value.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)),
      );
    }

    results.sort((a, b) => b.submittedAt - a.submittedAt);
    const total = results.length;
    return { results: results.slice(offset, offset + limit), total };
  }

  async delete(id: string, actorId: string): Promise<boolean> {
    return store.mutate(data => {
      const idx = data.answers.findIndex(a => a.id === id);
      if (idx === -1) return false;
      const [removed] = data.answers.splice(idx, 1);
      this.pushAudit(data, { guildId: removed.guildId, action: 'deleted', actorId, answerId: id, detail: `Form "${removed.formName}" answers deleted` });
      return true;
    });
  }

  async exportJson(guildId: string, filters: AnswerSearchFilters = {}, actorId = 'system'): Promise<string> {
    const { results } = await this.search(guildId, filters, Number.MAX_SAFE_INTEGER, 0);
    await store.mutate(data => this.pushAudit(data, { guildId, action: 'exported', actorId, detail: `Exported ${results.length} answer record(s) as JSON` }));
    return JSON.stringify(results, null, 2);
  }

  async exportCsv(guildId: string, filters: AnswerSearchFilters = {}, actorId = 'system'): Promise<string> {
    const { results } = await this.search(guildId, filters, Number.MAX_SAFE_INTEGER, 0);
    const questionTitles = [...new Set(results.flatMap(r => r.answers.map(a => a.title)))];
    const header = ['Submitted At', 'User', 'Panel', 'Form', 'Ticket Type', 'Ticket ID', ...questionTitles];
    const rows = results.map(r => {
      const byTitle = new Map(r.answers.map(a => [a.title, a.value]));
      return [
        new Date(r.submittedAt).toISOString(),
        r.userTag,
        r.panelName,
        r.formName,
        r.ticketType,
        r.ticketId ?? '',
        ...questionTitles.map(t => byTitle.get(t) ?? ''),
      ];
    });
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    await store.mutate(data => this.pushAudit(data, { guildId, action: 'exported', actorId, detail: `Exported ${results.length} answer record(s) as CSV` }));
    return [header, ...rows].map(row => row.map(cell => escape(String(cell))).join(',')).join('\n');
  }

  async audit(guildId: string, limit = 50): Promise<FormAnswerAuditEntry[]> {
    const data = await store.read();
    return data.audit
      .filter(e => e.guildId === guildId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async markViewed(guildId: string, answerId: string, actorId: string): Promise<void> {
    await store.mutate(data => this.pushAudit(data, { guildId, action: 'viewed', actorId, answerId }));
  }

  private pushAudit(data: AnswerData, entry: { guildId: string; action: FormAnswerAuditAction; actorId: string; answerId?: string; detail?: string }): void {
    data.audit.push({ id: genId('audit'), timestamp: Date.now(), ...entry });
    // Keep the audit log bounded — this is an operational trail, not a permanent ledger.
    if (data.audit.length > 5000) data.audit.splice(0, data.audit.length - 5000);
  }
}

export const answerEngine = new AnswerEngine();
