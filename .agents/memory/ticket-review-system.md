---
name: Ticket Review System Pro
description: Architecture and routing decisions for the post-close star-rating review DM feature.
---

## System overview
After a ticket closes, the opener gets a DM with 5 star-rating buttons. Clicking a star shows a comment modal. On modal submit: review saved, DM edited (buttons disabled), log embed posted.

## Key routing decision
DM interactions have no `guild`. The generic `tk:*` button block in `ai.service.ts` silently drops no-guild interactions. **Review routes (`tk:review:rate:*` and `tk:review:modal:*`) MUST be placed BEFORE the generic `tk:*` block**, or they are swallowed.

## Custom ID format
- Star button:    `tk:review:rate:<ticketId>:<rating>` (rating 1–5)
- Comment modal:  `tk:review:modal:<ticketId>:<channelId>:<messageId>`  
  Channel + message IDs encoded so modal submit can fetch and edit the original DM message.  
  Max length: ~79 chars (well within Discord's 100-char limit for a real ticket ID).

## In-memory pending rating
`TicketSystem.pendingReviews: Map<string, 1|2|3|4|5>` keyed `<ticketId>:<userId>`.  
Set on button click (in `handleReviewInteraction`), deleted on modal submit (in `handleReviewModal`).  
If the map entry is gone (e.g. restart), user gets "session expired" and must click again.

## Flow: button click → modal show → modal submit
- `showModal()` is called on `ButtonInteraction`, NOT ModalSubmitInteraction (you can't call showModal on a ModalSubmitInteraction in Discord.js 14).
- After modal submit, we fetch the original DM message by channelId + messageId and edit it to show disabled buttons + a "✅ Review Submitted" embed.

## Storage
`data/tickets/reviews.json` via `JsonStore<{ reviews: TicketReviewRecord[] }>`.  
Engine: `review-engine.ts` (`ReviewEngine` + singleton `reviewEngine`).

## CC Review Designer
- Route prefix: `tp:rv:*` (RV namespace in tp-ids.ts)
- Entry: `⭐ Reviews` button added to row 3 of `buildPanelDashboard()` (was 3 buttons, now 4 — still ≤5)
- Renderer: `tp-review-renderer.ts` → `buildReviewSection()`, `buildReviewLogChannelModal()`, `buildReviewDMMessageModal()`
- Service: `routeRVButton()` / `handleRVModal()` in `tp-designer.service.ts`

## Backward compatibility
`ReviewConfig` is `reviewConfig?: ReviewConfig` on `TicketPanel`.  
`normalizePanel()` deep-merges `DEFAULT_REVIEW_CONFIG` so old panels without the field get sensible defaults.  
`sendReviewDM()` checks `cfg.enabled` first — no DM sent for panels where reviews are off.

**Why:** DM star-rating interactions come without a guild; any guild-gated route silently drops them.
