---
name: Ticket Review DM interaction routing
description: Star-rating/comment-modal buttons in the review DM need routing before the guild-gated tk:* block, or they fail silently.
---

The Ticket Review star-rating buttons (`tk:review:rate:<ticketId>:<n>`) and their follow-up comment
modal (`tk:review:modal:<ticketId>:<channelId>:<messageId>`) are clicked inside the user's DM with
the bot, so `interaction.guild` is `null` for them. The generic `tk:*` router block in
`ai.service.ts` only dispatches when `interaction.guild` is truthy (guild-only ticket actions), so
without a dedicated branch these DM interactions matched the `tk:` prefix, got silently dropped,
and Discord showed the user "This interaction failed" (no reply ever sent, no error logged).

The handler methods (`TicketSystem.handleReviewInteraction` / `handleReviewModal` in
`community/tickets/index.ts`) already existed and were already written to work without a guild —
they were just never wired into the router. Fix: add explicit `tk:review:rate:` /
`tk:review:modal:` branches in `ai.service.ts` **before** the generic `tk:*` block, calling those
handlers directly with no `interaction.guild` guard.

**How to apply:** any DM-only interaction sharing a prefix with a guild-gated router block must get
its own un-gated branch placed earlier in the dispatch chain — a shared prefix isn't enough,
placement order determines whether the specific branch is ever reached.
