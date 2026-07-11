---
name: Ticket Type resolved-config wiring
description: How resolveTicketType()'s per-type overrides must flow through every ticket engine, and where a whole enforcement path (claim behaviour) was previously stubbed out.
---

`resolveTicketType(panel, ticketType)` in `types.ts` merges a button/select-option's `overrides` onto the panel once per action, producing a `cfg` object. Every engine (ticket, permission, transcript, automation, category) must receive that `cfg` — never the raw panel — for any action scoped to one ticket type (open, close, claim). Engine method params are named `cfg` (not `panel`) precisely to make it obvious at the call site that a raw panel is the wrong thing to pass.

**Why:** it's easy for a new call path to fetch the raw panel via `panelManager.get()` and call an engine directly, silently reintroducing panel-wide (non-per-type) behavior. Naming the param `cfg` and only ever constructing it via `resolveTicketType` at the interaction boundary (in `community/tickets/index.ts`) keeps this from regressing.

**How to apply:** when adding a new ticket interaction path, resolve `cfg = resolveTicketType(rawPanel, ticket.ticketType)` once near the top of the handler and thread `cfg` through — do not reintroduce a `panel: TicketPanel` param in ticket/permission/transcript/automation/category engine methods.

## Claim behaviour was a known stub
`TicketEngine.claim()` previously took no panel/cfg at all and never called `permissionEngine.hideFromOtherStaff` / `restoreStaffAccess`, even though the Permission Designer UI (`tp-permission-designer.ts` `buildPDClaim`) already exposed `hideFromOtherStaffOnClaim` / `keepVisible` / `managerOverride` / `adminOverride` toggles with a footer literally saying "Runtime enforcement requires TicketEngine claim integration." Fixed by giving `claim()` a `guild`, `cfg`, and `claimerRoleIds` param and wiring the hide/restore calls; effective hide = `hideFromOtherStaffOnClaim && !keepVisible` (keepVisible takes priority, per the Designer's own validation warning). `permissionEngine.hideFromOtherStaff` now also folds in `managerRoles`/`adminRoles` (previously only `supportRoles`+`managerRoles`), gated by `managerOverride`/`adminOverride`.

**How to apply:** if a Permission/Ticket Designer toggle exists in the UI, grep for whether the corresponding engine actually reads it before assuming a bug report about it is describing new work rather than finishing a documented stub.
