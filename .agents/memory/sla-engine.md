---
name: Ticket SLA Engine
description: Architecture and wiring decisions for the Ticket SLA System Pro
---

# Ticket SLA System Pro

## Files
- `community/tickets/sla-engine.ts` — engine, owns `data/tickets/sla.json` exclusively
- `discord/control-center/sla-designer.ts` — CC page, routes `sla:*` custom IDs
- SLA types are self-contained in sla-engine.ts (not added to types.ts)

## Hook points in ticket-engine.ts
- `createChannel`: `slaEngine.onTicketCreated(ticket)` after channel is created
- `claim`: `slaEngine.onFirstResponse(ticketId, userId, now)` on claim=true (already has the `now` const)
- `close`: `slaEngine.onResolved(ticket.id, closedAt)` after updating record

## Config key format
`${panelId}:${ticketType}` — used as key in `SLAGuildConfig.types`

## Custom ID encoding
ticket types in custom IDs use `encodeURIComponent(ticketType).slice(0, 50)` (sla:edittype and sla:modal:type)

## Sweeper
60-second interval, started in tickets/index.ts init(), stored in `slaSweepHandle`

## CC button
Added `📈 Ticket SLA` button alongside `🎨 Ticket Panel Designer` in tickets category (cc-panel.service.ts navToCategory)

## Router (CONFIRMED WIRED)
`sla:*` routing is in `ai.service.ts` — import comes directly from `'../discord/control-center/sla-designer'`
(NOT from the control-center index, which doesn't export it).
Routing block handles both `isButton()` and `isModalSubmit()` for sla:* custom IDs.
Placed after sp:* block, before sc:* block.

**Why:**
Keeping SLA engine separate from statistics-engine.ts avoids coupling two different concerns. SLA is compliance-tracking, stats is aggregate reporting.
