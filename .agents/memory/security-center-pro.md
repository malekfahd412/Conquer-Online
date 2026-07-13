---
name: Security Center Pro architecture
description: 14-module security system with CC designer, event guard, and emergency mode — all files, IDs, and wiring.
---

## Key file locations

- `community/security/security-types.ts` — `SecurityModuleKey` union (14 keys), `MODULE_META`, `KNOWN_SCAM_DOMAINS`, all shared types
- `community/security/security-store.ts` — JSON store at `data/security.json`; `getGuildConfig`, `patchModuleConfig`, `toggleModule`, `logSecurityEvent`
- `community/security/security-engine.ts` — `RateLimiter`, `isTrusted`, `applyPunishment`, `emitSecurityLog`, `fetchAuditExecutor`, `handleViolation`, `enableEmergencyMode`, `disableEmergencyMode`, `restoreChannel`, `restoreRole`
- `community/security/index.ts` — re-exports all three above
- `discord/security/security-guard.ts` — `SecurityGuard` class; `.start(client)` registers all 13 Discord event listeners
- `discord/control-center/security-center/sc-designer.ts` — CC page; `SecurityCenterDesigner`, `isSCInteraction`, singleton `securityCenterDesigner`
- `discord/control-center/security-center/index.ts` — re-exports designer

## 14 module keys

`anti_raid`, `anti_nuke`, `anti_bot_add`, `anti_channel`, `anti_role`, `anti_webhook`, `anti_emoji_sticker`, `anti_invite_spam`, `anti_link_spam`, `anti_mention_spam`, `anti_ghost_ping`, `anti_mass_dm`, `anti_bad_words`, `anti_scam_link`

## Custom-ID namespace (`sc:*`)

| ID pattern | Description |
|---|---|
| `sc:home` | Dashboard |
| `sc:select` | StringSelectMenu → navs to module |
| `sc:mod:<key>` | Module detail |
| `sc:toggle:<key>` | Toggle on/off |
| `sc:edit:<key>` | Open edit modal (5-field; no defer) |
| `sc:log:<key>` | Open log channel modal (no defer) |
| `sc:words:<key>` | Bad words modal, only for anti_bad_words (no defer) |
| `sc:test:<key>` | Simulation page |
| `sc:emergency` | Emergency mode page |
| `sc:emergency:on/off` | Enable / disable emergency |
| `sc:modal:edit:<key>` | Modal submit for edit |
| `sc:modal:log:<key>` | Modal submit for log |
| `sc:modal:words:<key>` | Modal submit for words |

**Why `sc:` prefix:** Prevents collision with `cc:`, `tp:`, `sla:`, `ra:`, etc. All modal-open buttons MUST NOT defer before calling `showModal()`.

## Wiring in ai.service.ts

Import: `import { securityCenterDesigner, isSCInteraction } from '../discord/control-center';`
Import: `import { SecurityGuard } from '../discord/security/security-guard';`

Field: `private readonly securityGuard: SecurityGuard;`
Constructor: `this.securityGuard = new SecurityGuard();`
`start()`: `this.securityGuard.start(client);`

Routing block (after RA block, before `tk:review:rate:` block):
```ts
if (
  (interaction.isButton() && isSCInteraction(customId)) ||
  (interaction.isStringSelectMenu() && isSCInteraction(customId)) ||
  (interaction.isModalSubmit() && isSCInteraction(customId))
) {
  if (interaction.guild) {
    securityCenterDesigner.handleInteraction(interaction, interaction.guild)...;
  }
  return;
}
```

## CC integration

- `CategoryKey` union in `cc-categories.ts` includes `'security'`
- `CATEGORY_ORDER` ends with `'security'` (28th entry)
- `navToCategory('security', ...)` in `cc-panel.service.ts` injects a `🛡️ Security Center` → `sc:home` Danger button

## Event guard coverage

| Event | Modules |
|---|---|
| `guildMemberAdd` | anti_raid (all-joins rate limit), anti_bot_add (audit log BotAdd) |
| `channelCreate/Delete/Update` | anti_channel, channelDelete also tracks anti_nuke |
| `roleCreate/Delete/Update` | anti_role, roleDelete also tracks anti_nuke |
| `webhookUpdate` | anti_webhook (tries WebhookCreate/Delete/Update audit entries) |
| `emojiCreate/Delete`, `stickerCreate/Delete` | anti_emoji_sticker |
| `inviteCreate` | anti_invite_spam (rate limit by inviter) |
| `messageCreate` | anti_mention_spam, anti_invite_spam (discord.gg links), anti_scam_link, anti_link_spam, anti_bad_words, anti_mass_dm |
| `messageDelete` | anti_ghost_ping (checks in-memory mention cache, 30s window) |

## Rate limiter key convention

- Guild-wide: `${guildId}:anti_raid:all`
- Per-executor: `${guildId}:${module}:${executorId}`
- Anti-nuke (channels): `${guildId}:anti_nuke:${executorId}`
- Anti-nuke (roles): `${guildId}:anti_nuke_role:${executorId}`

## Bad words extra field

Stored in `cfg.extra.words: string[]`. Configure via `sc:words:anti_bad_words` modal.

## Emergency mode

`enableEmergencyMode(guild, logChannelId)` → locks all text channels for @everyone, deletes invites, returns list of locked channel IDs.
`disableEmergencyMode(guild, lockedChannels, logChannelId)` → unlocks those channels.
Persisted in `SecurityGuildConfig.emergencyMode` + `emergencyLockedChannels`.
