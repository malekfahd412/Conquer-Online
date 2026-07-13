// ─────────────────────────────────────────────────────────────────────────────
// staffEventBus — the single decoupling point between Staff Management Pro and
// every other system (Tickets, Moderation, Verification, voice tools,
// security-report tool).
//
// Other systems call `staffEventBus.emitAction(...)` at their existing action
// sites — a one-line, fire-and-forget notification. They never import or call
// into `staff.service.ts` directly, and staff.service.ts never duplicates
// their counting/business logic; it only listens and aggregates.
// ─────────────────────────────────────────────────────────────────────────────
import { EventEmitter } from 'events';
import type { StaffActionType } from './types';

export interface StaffActionEvent {
  guildId: string;
  userId: string;
  userTag?: string;
  action: StaffActionType;
  /** Populated by ticket claim events: ms from ticket open → first staff reply. */
  firstResponseMs?: number;
  /** Populated by ticket close events: ms from ticket open → close. */
  resolutionMs?: number;
  /** Freeform context for the timeline description (e.g. case id, ticket number). */
  detail?: string;
  timestamp?: number;
}

class StaffEventBus extends EventEmitter {
  emitAction(evt: StaffActionEvent): void {
    this.emit('staff_action', { ...evt, timestamp: evt.timestamp ?? Date.now() });
  }

  onAction(handler: (evt: StaffActionEvent) => void): void {
    this.on('staff_action', handler);
  }
}

export const staffEventBus = new StaffEventBus();
// A misbehaving downstream listener throwing must never crash the emitting
// system (ticket close, a ban, etc.) — cap listeners warning noise instead.
staffEventBus.setMaxListeners(20);
