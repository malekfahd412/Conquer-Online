---
name: Support Inbox Pro architecture
description: DM help-desk module wired into the Control Center; captures inbound DMs and provides a full staff interface via si:* interactions.
---

## Location
- Types + store: `artifacts/discord-bot/src/community/inbox/` (types.ts, inbox-store.ts, index.ts)
- CC module:     `artifacts/discord-bot/src/discord/control-center/inbox/` (inbox-ids.ts, inbox-renderer.ts, inbox.service.ts, index.ts)
- Data file:     `artifacts/discord-bot/data/inbox.json` — `{ conversations: [] }`

## Key wiring changes
- `src/discord/client.ts` — added `GatewayIntentBits.DirectMessages` + `Partials.Channel` / `Partials.Message` (required to receive DMs)
- `src/ai/ai.service.ts` — added `InboxService` instance, `si:*` interaction dispatch block, DM listener (`messageCreate` where `!msg.guild && !msg.author.bot`), and support-staff branch in `/panel` command
- `src/discord/control-center/cc-panel.service.ts` — injects "📥 Support Inbox" (`si:home`) button in the `'members'` CC category
- `src/config/config.ts` + `src/index.ts` — `SUPPORT_STAFF_ROLE_ID` env var threaded through to `InboxService`

## Interaction namespace: `si:*`
Custom IDs defined in `inbox-ids.ts`. Critical patterns:
- `si:list:<sort>:<filter>:<page>` — all list state in the ID (stateless pagination)
- `si:view:<uid>:<page>` — conversation page
- `si:reply_s:`, `si:note_s:`, `si:tag_s:`, `si:ai:rw_s:` — modal submit IDs (note trailing `_s` to avoid prefix collision with button IDs)
- `si:ai:sug:`, `si:ai:sum:`, `si:ai:tr:`, `si:ai:rw:` — AI tool buttons

## Permission model
- Admin role (ROLE_ADMIN) → full CC access + inbox
- SUPPORT_STAFF_ROLE_ID → inbox only (non-admin staff route through `/panel` directly to inbox)
- All `si:*` interactions check `isSupportStaff()` before processing

## DM capture flow
1. User sends DM to bot → `messageCreate` event fires
2. `InboxService.onDirectMessage()` → `addUserMessage()` → `data/inbox.json`
3. Conversation reopened automatically if closed when new DM arrives
4. Staff reply sent via `client.users.fetch(uid).then(u => u.send(embed))`

## Write-queue pattern
`inbox-store.ts` uses the same serialised write queue as other stores — `writeQueue = p.then(...)` prevents concurrent JSON corruption.

**Why:** Concurrent async writes without a queue can interleave and corrupt the JSON file.
**How to apply:** Any new mutating function must chain onto `writeQueue` via the `mutate()` helper.

## Import conventions
All relative imports in this project use bare TypeScript paths (no `.js` extension) — tsx handles resolution. Using `.js` caused no runtime error in this project but is inconsistent with the codebase convention.
