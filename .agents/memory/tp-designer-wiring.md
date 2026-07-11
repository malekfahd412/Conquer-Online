---
name: Ticket Panel Designer wiring
description: How tp:* interactions are routed and where the designer is entered from the CC.
---

## Routing
- `ai.service.ts` checks `isTPInteraction(customId)` before the `tk:*` block and dispatches to `ticketPanelDesigner.handleInteraction()`.
- `isTPInteraction` is `(id: string) => id.startsWith('tp:')`.
- `TicketPanelDesigner` is instantiated once on `AIService` (not shared with CC service).

## Entry point
- `cc-panel.service.ts` `navToCategory` injects a `🎨 Ticket Panel Designer` button (`tp:list`) when `category === 'tickets'`.
- This button is NOT handled by CC service — `ai.service.ts` intercepts it first via prefix check.

## Custom ID scheme (tp-ids.ts)
- All IDs start with `tp:`. Panel IDs use underscores (`panel_<ts>_<rand>`), no colons — safe to split on `:`.
- Modal IDs follow pattern `tp:modal:<panelId>:<field>` for field edits; action modals use longer prefixes like `tp:btn:add:m:<panelId>`.

## New fields added to TicketEmbedConfig (types.ts)
- `author?: string` — shown via `embed.setAuthor({ name })`.
- `showTimestamp?: boolean` — shown via `embed.setTimestamp()`.
- Both fields applied in `panel-manager.ts buildPayload()`.

**Why:** Modal submit interactions (tp:modal:*) cannot be routed by the CC service since it only handles cc:* IDs. A single prefix guard in ai.service.ts cleanly handles all 3 interaction types (button, select menu, modal) for the designer.
