---
name: Ticket Review DM config
description: Why the post-ticket-close review DM can silently stop firing, and the merge-pattern fix.
---

`ReviewConfig.enabled` defaults to `false` (`DEFAULT_REVIEW_CONFIG` in `community/tickets/types.ts`) —
the review DM (star rating sent to the ticket opener after close) is opt-in per panel, not on by
default. Panels created before the review feature existed, or ones whose `reviewConfig` was
partially set, may have no `reviewConfig` at all in `data/tickets/panels.json`.

Everywhere else in the ticket codebase reads a panel's `reviewConfig` via the merge pattern
`{ ...DEFAULT_REVIEW_CONFIG, ...(panel.reviewConfig ?? {}) }` (designer, resolveTicketType,
normalizePanel). `ReviewEngine.sendReviewDM` used to read it as a raw `panel.reviewConfig ??
DEFAULT_REVIEW_CONFIG` fallback instead — if a stored `reviewConfig` object existed but was missing
the `enabled` key (e.g. saved before that field existed), this evaluated to `undefined` (falsy) and
silently skipped sending, with no error logged. Fixed to use the same merge pattern as the rest of
the codebase; apply that pattern to any future panel-sourced config read for consistency.

**How to apply:** if a user reports a ticket-system feature "stopped working" with no errors in
logs, check whether the config is read via `panel.field ?? DEFAULT` (raw fallback, bug-prone) vs.
the merge pattern — `panelManager.get()` returns raw, un-normalized panels straight from disk.
