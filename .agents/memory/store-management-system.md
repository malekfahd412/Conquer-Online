---
name: Store Management System
description: Phase 1 store system architecture — where things live, key design decisions, and integration points.
---

## Module location
`artifacts/discord-bot/src/store/` — completely independent from tickets and inbox.

## Data files
All data lives under `data/store/` (never touches `data/tickets/`):
- `categories.json`, `products.json`, `orders.json`, `statistics.json`, `settings.json`
- Uses `StoreJson<T>` (in `src/store/services/store-data.ts`) — mirrors the ticket `JsonStore<T>` pattern but pointed at `data/store/`.

## Custom ID namespace
`st:*` — routed in `ai.service.ts` before the `ap:*` block. All buy-flow IDs are ephemeral-safe.

## Key design decisions
- **Stock only decrements on Completed** — not on Paid or Delivering. This matches the spec and prevents phantom deductions.
- **Order channel created per-order** — not a ticket panel entry. `resolveOrderCategory()` finds or creates a "Store Orders" Discord category at runtime and caches its ID in `settings.json`.
- **Sequential IDs** — `STORE-000001` via an atomic counter in `orders.json`. Channel name mirrors it: `store-000001`.
- **Staff check** — `isStaff()` checks `ManageGuild` OR membership in `settings.supportRoles`/`settings.adminRoles`. Add role IDs to settings to give staff access without full admin.
- **`void guild`** idiom used in `handleSelectMenu` — guild is passed for potential future use; the void suppresses the unused-parameter error under `noUnusedParameters`.

## Integration points
- `ai.service.ts` imports `storeSystem` and `isStoreInteraction` from `src/store/index.js`
- `init(client)` called on bot start (alongside `ticketSystem.init`)
- `/store` command added to `src/discord/slash-command-registrar.ts` as the first entry in `ALL_COMMANDS`

## Admin commands (all require Administrator or ManageGuild)
`/store panel` · `/store stats` · `/store category add|list` · `/store product add|list|stock|hide|delete`

**Why:** keeping all admin access behind Discord permissions means no separate role config needed for admins.
