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

## Router
`sla:*` routed in ai.service.ts before the `tk:*` block; `isSLAInteraction` function exported from sla-designer.ts

**Why:**
Keeping SLA engine separate from statistics-engine.ts avoids coupling two different concerns. SLA is compliance-tracking, stats is aggregate reporting.
