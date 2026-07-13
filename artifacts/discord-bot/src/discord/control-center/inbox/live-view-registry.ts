// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Live View Registry
//
// Discord DMs/interactions have no push-update mechanism for staff-facing
// ephemeral panels, so "live sync" is approximated: every staff member's
// currently-open inbox screen (the list, or a single conversation) is
// tracked here by their Discord user ID. Whenever a new DM comes in or a
// staff reply is sent, we re-render and `editReply()` every matching open
// screen in place — no refresh click required.
//
// Limitation: interaction webhook tokens expire ~15 minutes after the
// interaction was created. Once a view is that stale, edits will fail and
// the entry is dropped silently; the staff member simply needs to reopen
// the panel (e.g. via /panel or 📥 Support Inbox) to resume live updates.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from 'discord.js';
import type { InboxSortMode, InboxFilterMode } from '../../../community/inbox';
import { logger } from '../../../utils/logger';

export type ViewInteraction =
  | ButtonInteraction
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

export type RenderPayload = { content: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] };

interface ConversationViewState {
  kind: 'conversation';
  uid: string;
  page: number;
  interaction: ViewInteraction;
  registeredAt: number;
}

interface ListViewState {
  kind: 'list';
  sort: InboxSortMode;
  filter: InboxFilterMode;
  page: number;
  interaction: ViewInteraction;
  registeredAt: number;
}

type ViewState = ConversationViewState | ListViewState;

/** Interaction webhook tokens are valid for ~15 minutes; stay safely under that. */
const VIEW_TTL_MS = 14 * 60 * 1000;

export class LiveViewRegistry {
  private readonly views = new Map<string, ViewState>();

  setConversationView(staffId: string, uid: string, page: number, interaction: ViewInteraction): void {
    this.views.set(staffId, { kind: 'conversation', uid, page, interaction, registeredAt: Date.now() });
  }

  setListView(
    staffId: string,
    sort: InboxSortMode,
    filter: InboxFilterMode,
    page: number,
    interaction: ViewInteraction,
  ): void {
    this.views.set(staffId, { kind: 'list', sort, filter, page, interaction, registeredAt: Date.now() });
  }

  /** Call when a staff member navigates to a screen that isn't live-tracked (search, AI results, etc). */
  clear(staffId: string): void {
    this.views.delete(staffId);
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, view] of this.views) {
      if (now - view.registeredAt > VIEW_TTL_MS) this.views.delete(id);
    }
  }

  /** Re-renders every open view of this conversation. */
  async notifyConversation(uid: string, render: (page: number) => Promise<RenderPayload>): Promise<void> {
    this.prune();
    for (const [staffId, view] of [...this.views]) {
      if (view.kind !== 'conversation' || view.uid !== uid) continue;
      try {
        const payload = await render(view.page);
        await view.interaction.editReply(payload);
      } catch (err) {
        logger.warning(`[Inbox] Live conversation update dropped for staff ${staffId}`, err);
        this.views.delete(staffId);
      }
    }
  }

  /** Re-renders every open inbox-list view (unread counts / previews may have changed). */
  async notifyList(
    render: (sort: InboxSortMode, filter: InboxFilterMode, page: number) => Promise<RenderPayload>,
  ): Promise<void> {
    this.prune();
    for (const [staffId, view] of [...this.views]) {
      if (view.kind !== 'list') continue;
      try {
        const payload = await render(view.sort, view.filter, view.page);
        await view.interaction.editReply(payload);
      } catch (err) {
        logger.warning(`[Inbox] Live list update dropped for staff ${staffId}`, err);
        this.views.delete(staffId);
      }
    }
  }
}
