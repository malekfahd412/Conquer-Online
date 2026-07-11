---
name: Permission Designer schema & wiring
description: How the Ticket Panel Permission Designer is structured, its custom ID namespace, new TicketPanel fields, backward-compat pattern, and the migration.ts gotcha.
---

## Custom ID namespace
All Permission Designer buttons use `tp:pd:*` prefix, routed by `routePDButton()` inside `tp-designer.service.ts`. The order of checks inside that method matters:
1. Specific prefixes first (`tp:pd:mperm:`, `tp:pd:sperm:`, `tp:pd:setvis:`, `tp:pd:ctog:`, `tp:pd:team`, `tp:pd:mperms`, `tp:pd:sperms`, `tp:pd:vis`, `tp:pd:claim`, `tp:pd:preview`, `tp:pd:edit`, `tp:pd:back`)
2. Catch-all `tp:pd:<panelId>` (main PD view) must be LAST.

Modal IDs use `tp:pd:modal:*` and must be routed BEFORE `tp:modal:*` in `routeModal()` to avoid prefix conflicts.

Guards needed:
- `tp:pd:vis:` check must exclude `tp:pd:setvis:` (use `&& !id.startsWith('tp:pd:setvis:')`)
- `tp:pd:claim:` check must exclude `tp:pd:ctog:` similarly

## New TicketPanel fields (added July 2026)
```typescript
adminRoles: string[];                       // roles with full channel admin
memberPerms: TicketMemberPermConfig;        // what opener/members can do
staffPerms: TicketStaffPermConfig;          // extra staff-tier permissions
visibility: TicketVisibilityMode;           // 'private' | 'support-visible' | 'public'
claimBehaviour: TicketClaimBehaviourConfig; // claim visibility rules
```

Constants `DEFAULT_MEMBER_PERMS`, `DEFAULT_STAFF_PERMS`, `DEFAULT_CLAIM_BEHAVIOUR` exported from `types.ts`.

## Backward compatibility
`normalizePanel(panel)` in `types.ts` fills missing fields with defaults — call it in `permission-engine.ts` and anywhere a stored panel is loaded. Old panels in JSON without the new fields stay valid.

## migration.ts gotcha
`convertPanel()` in `migration.ts` builds a full `TicketPanel` object. Any new **required** field added to `TicketPanel` must also be added there with sensible defaults, or TypeScript will error at compile time. This is the one place that doesn't go through `normalizePanel`.

**Why:** TypeScript strict mode catches the missing properties at build time, not runtime, so it's safe — but only if you remember to update migration.ts alongside types.ts.

**How to apply:** Whenever extending `TicketPanel` with a required field, grep for `convertPanel` in `migration.ts` and add the field there.

## Files
- `types.ts` — 4 new types, 5 new fields, 3 constants, `normalizePanel()`
- `permission-engine.ts` — calls `normalizePanel`, applies new fields to channel overwrites
- `tp-permission-designer.ts` — all PD embed/button/modal builders (`buildPDMain`, `buildPDSupportTeam`, etc.)
- `tp-renderer.ts` — `buildPermissionsSection` delegates to `buildPDMain`
- `tp-designer.service.ts` — `routePDButton`, modal routing, 5 handlers, `handleCreatePanel` updated
- `tp-ids.ts` — PD sub-namespace constants
- `panel-defaults.ts` — updated defaults with new fields
- `migration.ts` — `convertPanel` patched with new fields
