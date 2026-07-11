// ─────────────────────────────────────────────────────────────────────────────
// FormTemplateEngine — built-in Question/Form Builder starting points.
//
// Distinct from TemplateEngine/TicketTemplate (template-engine.ts), which
// snapshots an entire *panel*. A "form template" here is a much smaller,
// disposable starting point for a single `TicketForm` — picking one just
// pre-fills a new form's questions so an admin isn't starting from a blank
// page; nothing is persisted until they save it onto a panel.
// ─────────────────────────────────────────────────────────────────────────────
import { genId } from './store';
import type { TicketForm, FormQuestion } from './types';

export type FormTemplateKey =
  | 'support'
  | 'purchase'
  | 'bug_report'
  | 'appeal'
  | 'staff_application'
  | 'partnership'
  | 'custom';

export interface FormTemplateMeta {
  key: FormTemplateKey;
  name: string;
  emoji: string;
  description: string;
}

export const FORM_TEMPLATES: FormTemplateMeta[] = [
  { key: 'support',           name: 'Support',           emoji: '🛟', description: 'General help request — subject, description, priority, contact' },
  { key: 'purchase',          name: 'Purchase',           emoji: '🛒', description: 'Order issue — item, order number, payment method, description' },
  { key: 'bug_report',        name: 'Bug Report',        emoji: '🐞', description: 'Bug write-up — title, repro steps, expected vs actual, platform' },
  { key: 'appeal',            name: 'Appeal',            emoji: '⚖️', description: 'Ban/mute appeal — reason, user ID, incident date, context' },
  { key: 'staff_application', name: 'Staff Application', emoji: '📋', description: 'Applicant intake — username, age, availability, pitch, experience' },
  { key: 'partnership',       name: 'Partnership',       emoji: '🤝', description: 'Partner request — server name, invite, member count, goals' },
  { key: 'custom',            name: 'Custom',            emoji: '🧩', description: 'Start from a blank form and add your own questions' },
];

function q(id: string, partial: Omit<FormQuestion, 'id' | 'required'> & { required?: boolean }): FormQuestion {
  return { id, required: true, ...partial };
}

function questionsFor(key: FormTemplateKey): FormQuestion[] {
  switch (key) {
    case 'support':
      return [
        q('subject',  { type: 'short_text', title: 'Subject', placeholder: 'Brief summary of your issue', maxLength: 100 }),
        q('details',  { type: 'paragraph',  title: 'Description', placeholder: 'Describe your issue in detail', maxLength: 1000 }),
        q('priority', { type: 'short_text', title: 'Priority', placeholder: 'Low, Medium, High, Urgent', required: false, maxLength: 20 }),
        q('contact',  { type: 'email',      title: 'Contact Email', placeholder: 'you@example.com', required: false }),
      ];
    case 'purchase':
      return [
        q('item',    { type: 'short_text', title: 'Product / Item', placeholder: 'What did you purchase?', maxLength: 100 }),
        q('order',   { type: 'short_text', title: 'Order Number', placeholder: 'e.g. ORD-12345', maxLength: 50 }),
        q('payment', { type: 'short_text', title: 'Payment Method', placeholder: 'PayPal, Card, Crypto, etc.', required: false, maxLength: 50 }),
        q('issue',   { type: 'paragraph',  title: 'Describe the Issue', placeholder: "What's wrong with your order?", maxLength: 1000 }),
      ];
    case 'bug_report':
      return [
        q('title',    { type: 'short_text', title: 'Bug Title', placeholder: 'Short summary of the bug', maxLength: 100 }),
        q('steps',    { type: 'paragraph',  title: 'Steps to Reproduce', placeholder: '1. ... 2. ... 3. ...', maxLength: 1000 }),
        q('expected', { type: 'paragraph',  title: 'Expected vs Actual', placeholder: 'What did you expect vs. what happened?', maxLength: 1000 }),
        q('platform', { type: 'short_text', title: 'Platform', placeholder: 'Desktop, Mobile, Web...', required: false, maxLength: 50 }),
      ];
    case 'appeal':
      return [
        q('reason',   { type: 'paragraph',        title: 'Reason for Appeal', placeholder: 'Why should this action be reversed?', maxLength: 1000 }),
        q('userId',   { type: 'discord_user_id',  title: 'Your Discord User ID' }),
        q('incident', { type: 'date',             title: 'Date of Incident', placeholder: 'YYYY-MM-DD', required: false }),
        q('context',  { type: 'paragraph',        title: 'Additional Context', placeholder: 'Anything else we should know?', required: false, maxLength: 1000 }),
      ];
    case 'staff_application':
      return [
        q('username',     { type: 'discord_username', title: 'Discord Username' }),
        q('age',           { type: 'number',            title: 'Age', required: false }),
        q('availability',  { type: 'short_text',        title: 'Weekly Availability', placeholder: 'e.g. 10 hours/week, evenings', maxLength: 100 }),
        q('why',            { type: 'paragraph',          title: 'Why Should We Pick You?', maxLength: 1000 }),
        q('experience',     { type: 'paragraph',          title: 'Previous Experience', required: false, maxLength: 1000 }),
      ];
    case 'partnership':
      return [
        q('serverName',  { type: 'short_text', title: 'Server / Brand Name', maxLength: 100 }),
        q('invite',      { type: 'url',        title: 'Server Invite / Link' }),
        q('memberCount', { type: 'number',     title: 'Member Count', required: false }),
        q('goals',       { type: 'paragraph',  title: 'Partnership Goals', placeholder: 'What are you hoping to get from this partnership?', maxLength: 1000 }),
      ];
    case 'custom':
    default:
      return [];
  }
}

/** Builds a fresh, unsaved TicketForm from a built-in template key. Question IDs are freshly generated so multiple forms never collide. */
export function buildFormFromTemplate(key: FormTemplateKey, name?: string): TicketForm {
  const meta = FORM_TEMPLATES.find(t => t.key === key);
  const now = Date.now();
  const questions = questionsFor(key).map(question => ({ ...question, id: genId('q') }));
  return {
    id: genId('form'),
    name: name || meta?.name || 'New Form',
    description: meta?.description,
    questions,
    nextRules: [],
    defaultNextFormId: undefined,
    createdAt: now,
    updatedAt: now,
  };
}
