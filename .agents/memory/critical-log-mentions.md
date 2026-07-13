---
name: Critical Log Mentions
description: Per-log-type mention roles + Critical Only toggle; global security alert role in Security Center.
---

## What was built
- Each log type in the Logs Manager now has a native Discord `RoleSelectMenuBuilder` role picker (button `lg:setmenrole:<type>` → `lg:setmenrole:s:<type>` submit, max 5 roles).
- `mentionCriticalOnly` toggle (button `lg:togglecritical:<type>`) — when ON, the role is suppressed unless the type is in `CRITICAL_LOG_TYPES` (ban/kick/timeout).
- Security Center dashboard has a global `securityMentionRoleId` — set via `sc:setmenrole` button → `sc:setmenrole:s` RoleSelectMenu (max 1 role); `sc:clrmenrole` to clear.

## Where the mention fires
- **Log events**: `server-log.service.ts` line ~116 — `resolveLogConfig` returns `mentionRoles` (respecting criticalOnly); `send({ content: mentions, embeds: [embed] })`.
- **Security violations**: `handleViolation` in `security-engine.ts` — all 23 `handleViolation` calls in `security-guard.ts` pass `globalMentionRoleId: cfg.securityMentionRoleId`.
- **Emergency mode**: `enableEmergencyMode` / `disableEmergencyMode` accept optional `mentionRoleId` (3rd/4th arg) and prefix the embed with `<@&mentionRoleId>`.

## Routing
- `ai.service.ts` LG and SC routing blocks both gate on `interaction.isRoleSelectMenu()` in addition to button/select/modal.
- `lg-designer.service.ts` dispatches to `routeRoleSelect()` for `lg:setmenrole:s:*`.
- `sc-designer.ts` `NavInteraction` type includes `RoleSelectMenuInteraction`; role submit handled before the button block.

## Per-module mention role override (Security Center)
- Each `SecurityModuleConfig` has `mentionRoleId?: string` — overrides the guild-level `securityMentionRoleId` for that specific module.
- `ViolationOpts` has both `moduleMentionRoleId?` and `globalMentionRoleId?`; `handleViolation` resolves with `moduleMentionRoleId ?? globalMentionRoleId`.
- All 23 `handleViolation` calls in `security-guard.ts` pass both: `globalMentionRoleId: cfg.securityMentionRoleId` and `moduleMentionRoleId: <modVar>.mentionRoleId` (correct per-module config var).
- `sc-designer.ts` routes `sc:mod:setmenrole:<key>` / `sc:mod:setmenrole:s:<key>` / `sc:mod:clrmenrole:<key>` — must come BEFORE the generic `sc:mod:` handler in the button router.
- `moduleStatusEmbed` shows `🔔 Mention Role` field with *(module)* or *(global fallback)* suffix for context.

## Key types/files
- `log-store.ts`: `CRITICAL_LOG_TYPES` (Set), `mentionCriticalOnly` on `LogTypeConfig`, `resolveLogConfig` suppression logic.
- `security-types.ts`: `securityMentionRoleId?: string` on `SecurityGuildConfig`; `mentionRoleId?: string` on `SecurityModuleConfig`.
- `lg-ids.ts`: `setmenrole`, `setmenroleS`, `clrmenrole`, `togglecritical` ID helpers.

## Watch-out: security-guard.ts variable naming
When adding properties to `handleViolation` calls, `cfg` in that file = `SecurityGuildConfig` (guild-level). The module config uses a local variable like `raidCfg`, `modCfg`, `nukeCfg`, `spamCfg` — always read the `cfg: <varname>` property inside the block to know which variable to use.
