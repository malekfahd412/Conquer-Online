---
name: Store Management System
description: Phase 1 + Phase 2 store system architecture — where things live, key design decisions, and integration points.
---

## Module location
`artifacts/discord-bot/src/store/` — completely independent from tickets and inbox.

## Data files
All data lives under `data/store/` (never touches `data/tickets/`):
- Phase 1: `categories.json`, `products.json`, `orders.json`, `statistics.json`, `settings.json`
- Phase 2 (auto-created on first run): `payment-methods.json`, `coupons.json`, `offers.json`, `audit.json`, `staff-roles.json`
- Uses `StoreJson<T>` (in `src/store/services/store-data.ts`) — mirrors the ticket `JsonStore<T>` pattern but pointed at `data/store/`.

## Custom ID namespace
`st:*` — routed in `ai.service.ts` before the `ap:*` block. All buy-flow IDs are ephemeral-safe.

### Phase 2 ID namespaces
- `st:pm:*` — payment method selection/change
- `st:pr:*` — payment proof submit/approve/reject/moreinfo/view
- `st:var:*` — variant selection (select + pick)
- `st:cp:*` / `st:modal:cp:*` — coupon entry
- `st:ss:*` / `st:modal:ss:*` — settings panel
- `st:dash:*` — admin dashboard buttons
- `st:cust:*` — customer dashboard
- `st:dn:*` / `st:modal:dn:*` — delivery notes
- `st:myorders:*` — my orders select menu
- `st:search:*` — search result select
- `st:order:prepare:*`, `st:order:refund:*` — new status transitions

## Key design decisions
- **Stock only decrements on Completed** — not on Paid or Delivering. Prevents phantom deductions.
- **Order channel created per-order** — not a ticket panel entry. `resolveOrderCategory()` finds/creates a "Store Orders" Discord category and caches its ID in `settings.json`.
- **Sequential IDs** — `STORE-000001` via an atomic counter in `orders.json`. Channel name mirrors it.
- **Staff check** — `isStaff()` checks `ManageGuild` OR membership in `settings.supportRoles`/`settings.adminRoles`.
- **`void guild`** idiom used in handlers where guild is passed for future use.
- **Dynamic import for delivery-note modal** — uses `ActionRowBuilder<InstanceType<typeof TextInputBuilder>>` (not `ARB<TIB>`) to satisfy TS strict mode with dynamic imports.
- **`formatStock` removed** from `order-channel-renderer.ts` — was dead code; noUnusedLocals catches even `_`-prefixed functions.
- **`normalizeProduct` is a function** in `models/index.ts`; product-manager.ts must NOT import it as a type.

## Integration points
- `ai.service.ts` imports `storeSystem` and `isStoreInteraction` from `src/store/index.js`
- `init(client)` called on bot start; internally initialises all 10 `ensureFile()` calls in parallel
- `/store` command in `src/discord/slash-command-registrar.ts`

## Slash commands (all require Administrator or ManageGuild)
**Phase 1:** `/store panel` · `/store stats` · `/store category add|list` · `/store product add|list|stock|hide|delete`

**Phase 2:** `/store dashboard` · `/store settings` · `/store search` · `/store audit` · `/store export [format]`
· `/store coupon add|list|delete` · `/store payment list|toggle` · `/store offer add|list|delete`
· `/store product variant` (added as sub under existing product group)

**Why:** keeping all admin access behind Discord permissions means no separate role config needed for admins.
