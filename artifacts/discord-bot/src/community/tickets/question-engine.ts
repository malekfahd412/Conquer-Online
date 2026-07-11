// ─────────────────────────────────────────────────────────────────────────────
// QuestionEngine — builds and parses ticket-opening questions.
//
// Two systems live here, sharing the same modal-building/validation core:
//  1. Legacy `modal` (TicketModalConfig) — a single, fixed 5-question form.
//     Kept only for backward compatibility with panels created before the
//     Question/Form Builder shipped. No new panels should use it.
//  2. Form Builder (Phase 4) — unlimited named `TicketForm`s per panel (each
//     still capped at 5 questions — a hard Discord modal limit), with 10
//     typed question kinds, per-question validation, conditional
//     (`showIf`) questions, and chaining to a follow-up form via `nextRules`.
//
// Owns no storage; forms/questions live inside the TicketPanel, owned by
// PanelManager. Answers submitted through a form are additionally persisted
// separately by AnswerEngine (see answer-engine.ts) once a chain completes.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ModalBuilder,
  EmbedBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ModalActionRowComponentBuilder,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { TicketModalConfig, TicketForm, FormQuestion, QuestionType } from './types';
import { QUESTION_TYPE_META } from './types';

const STYLE_MAP = { short: TextInputStyle.Short, paragraph: TextInputStyle.Paragraph } as const;

export const MAX_QUESTIONS_PER_FORM = 5;

/** Special knownAnswers key referencing which button/select option started the flow. */
export const TICKET_TYPE_ANSWER_KEY = '__ticketType';

export interface FormValidationError {
  questionId: string;
  title: string;
  message: string;
}

export type FormValidationResult =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; errors: FormValidationError[] };

const TYPE_PATTERNS: Partial<Record<QuestionType, RegExp>> = {
  email:            /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url:              /^https?:\/\/\S+$/i,
  number:           /^-?\d+(\.\d+)?$/,
  discord_user_id:  /^\d{17,20}$/,
  role_mention:     /^(<@&\d{17,20}>|\d{17,20})$/,
  channel_mention:  /^(<#\d{17,20}>|\d{17,20})$/,
  discord_username: /^[a-zA-Z0-9_.]{2,32}(#\d{4})?$/,
  date:             /^\d{4}-\d{2}-\d{2}$/,
};

const TYPE_ERROR_MESSAGES: Partial<Record<QuestionType, string>> = {
  email:            'Please enter a valid email address.',
  url:              'Please enter a valid link starting with http:// or https://.',
  number:           'Please enter a number.',
  discord_user_id:  'Please enter a valid Discord user ID (17-20 digits).',
  role_mention:     'Please enter a role mention (@Role) or raw role ID.',
  channel_mention:  'Please enter a channel mention (#channel) or raw channel ID.',
  discord_username: 'Please enter a valid Discord username.',
  date:             'Please use the format YYYY-MM-DD.',
};

export class QuestionEngine {
  // ── Legacy single-modal API (kept for backward compatibility) ────────────

  hasQuestions(modal: TicketModalConfig): boolean {
    return modal.enabled && modal.questions.length > 0;
  }

  buildModal(customId: string, modal: TicketModalConfig): ModalBuilder {
    const builder = new ModalBuilder().setCustomId(customId).setTitle(modal.title?.slice(0, 45) || 'Open a Ticket');
    for (const q of modal.questions.slice(0, 5)) {
      const input = new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.label.slice(0, 45))
        .setStyle(STYLE_MAP[q.style])
        .setRequired(q.required);
      if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
      if (q.minLength !== undefined) input.setMinLength(q.minLength);
      if (q.maxLength !== undefined) input.setMaxLength(q.maxLength);
      builder.addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input));
    }
    return builder;
  }

  parseSubmission(interaction: ModalSubmitInteraction, modal: TicketModalConfig): Record<string, string> {
    const answers: Record<string, string> = {};
    for (const q of modal.questions) {
      const value = interaction.fields.getTextInputValue(q.id);
      if (value) answers[q.id] = value;
    }
    return answers;
  }

  formatAnswersForEmbed(modal: TicketModalConfig, answers: Record<string, string>): { name: string; value: string }[] {
    return modal.questions
      .filter(q => answers[q.id])
      .map(q => ({ name: q.label, value: answers[q.id].slice(0, 1024) }));
  }

  // ── Form Builder (Phase 4) ────────────────────────────────────────────────

  /** Text input style for a given question type. Only Paragraph gets a multi-line box. */
  styleForType(type: QuestionType): TextInputStyle {
    return type === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short;
  }

  /** Questions in this form that should currently be shown, given answers collected so far in the chain. */
  visibleQuestions(form: TicketForm, knownAnswers: Record<string, string>): FormQuestion[] {
    return form.questions.filter(q => {
      if (!q.showIf) return true;
      const known = knownAnswers[q.showIf.questionId];
      if (known === undefined) return false;
      return known.toLowerCase() === q.showIf.equals.toLowerCase();
    });
  }

  buildFormModal(customId: string, form: TicketForm, knownAnswers: Record<string, string>, prefill?: Record<string, string>): ModalBuilder {
    const builder = new ModalBuilder().setCustomId(customId).setTitle(form.name.slice(0, 45) || 'Ticket Form');
    const visible = this.visibleQuestions(form, knownAnswers).slice(0, MAX_QUESTIONS_PER_FORM);
    for (const q of visible) {
      const meta = QUESTION_TYPE_META[q.type];
      const input = new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.title.slice(0, 45))
        .setStyle(this.styleForType(q.type))
        .setRequired(q.required);
      const placeholder = q.placeholder || meta.hint;
      if (placeholder) input.setPlaceholder(placeholder.slice(0, 100));
      if (q.minLength !== undefined) input.setMinLength(Math.max(0, q.minLength));
      if (q.maxLength !== undefined) input.setMaxLength(Math.min(4000, Math.max(1, q.maxLength)));
      const value = prefill?.[q.id] ?? q.defaultValue;
      if (value) input.setValue(value.slice(0, 4000));
      builder.addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input));
    }
    return builder;
  }

  /** Validates a single raw value against a question's type + custom rules. Returns an error message, or null if valid. */
  validateQuestionValue(q: FormQuestion, raw: string): string | null {
    const value = raw.trim();
    if (!value) {
      return q.required ? (q.errorMessage || `${q.title} is required.`) : null;
    }
    if (q.minLength !== undefined && value.length < q.minLength) {
      return q.errorMessage || `${q.title} must be at least ${q.minLength} characters.`;
    }
    if (q.maxLength !== undefined && value.length > q.maxLength) {
      return q.errorMessage || `${q.title} must be at most ${q.maxLength} characters.`;
    }
    const typePattern = TYPE_PATTERNS[q.type];
    if (typePattern && !typePattern.test(value)) {
      return q.errorMessage || TYPE_ERROR_MESSAGES[q.type] || `${q.title} has an invalid format.`;
    }
    if (q.type === 'date' && typePattern?.test(value) && isNaN(Date.parse(value))) {
      return q.errorMessage || TYPE_ERROR_MESSAGES.date || `${q.title} is not a valid date.`;
    }
    if (q.validationRegex) {
      try {
        const re = new RegExp(q.validationRegex);
        if (!re.test(value)) {
          return q.errorMessage || `${q.title} does not match the required format.`;
        }
      } catch {
        // Malformed regex saved by an admin — do not block submission on a server-side bug.
      }
    }
    return null;
  }

  /** Reads + validates every currently-visible question of a submitted form. */
  validateForm(interaction: ModalSubmitInteraction, form: TicketForm, knownAnswers: Record<string, string>): FormValidationResult {
    const visible = this.visibleQuestions(form, knownAnswers).slice(0, MAX_QUESTIONS_PER_FORM);
    const errors: FormValidationError[] = [];
    const answers: Record<string, string> = {};

    for (const q of visible) {
      let raw: string;
      try {
        raw = interaction.fields.getTextInputValue(q.id);
      } catch {
        continue; // question wasn't actually rendered in this submission
      }
      const err = this.validateQuestionValue(q, raw);
      if (err) {
        errors.push({ questionId: q.id, title: q.title, message: err });
        continue;
      }
      if (raw.trim()) answers[q.id] = raw.trim();
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, answers };
  }

  /** First matching nextRule (case-insensitive equality against this form's answers), else defaultNextFormId. */
  pickNextFormId(form: TicketForm, answers: Record<string, string>): string | undefined {
    for (const rule of form.nextRules) {
      const value = answers[rule.questionId];
      if (value !== undefined && value.toLowerCase() === rule.equals.toLowerCase()) {
        return rule.nextFormId;
      }
    }
    return form.defaultNextFormId;
  }

  formatFormAnswersForEmbed(forms: TicketForm[], answers: Record<string, string>): { name: string; value: string }[] {
    const fields: { name: string; value: string }[] = [];
    for (const form of forms) {
      for (const q of form.questions) {
        if (answers[q.id]) fields.push({ name: q.title, value: answers[q.id].slice(0, 1024) });
      }
    }
    return fields;
  }

  buildAnswerSummaryEmbed(opts: {
    forms: TicketForm[];
    answers: Record<string, string>;
    userTag: string;
    submittedAt: number;
    color?: number;
  }): EmbedBuilder {
    const fields = this.formatFormAnswersForEmbed(opts.forms, opts.answers);
    const embed = new EmbedBuilder()
      .setColor(opts.color ?? 0x5865f2)
      .setTitle('📋 Answer Summary')
      .setFooter({ text: `Submitted by ${opts.userTag}` })
      .setTimestamp(opts.submittedAt);
    if (fields.length > 0) {
      embed.addFields(fields.slice(0, 25));
    } else {
      embed.setDescription('_No answers were provided._');
    }
    return embed;
  }
}

export const questionEngine = new QuestionEngine();
