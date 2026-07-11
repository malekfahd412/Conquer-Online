// ─────────────────────────────────────────────────────────────────────────────
// QuestionEngine — builds and parses the modal shown when a panel has
// pre-ticket questions configured. Owns no storage; the questions themselves
// live inside the TicketPanel (panel.modal), owned by PanelManager.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ModalActionRowComponentBuilder,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { TicketModalConfig } from './types';

const STYLE_MAP = { short: TextInputStyle.Short, paragraph: TextInputStyle.Paragraph } as const;

export class QuestionEngine {
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
}

export const questionEngine = new QuestionEngine();
