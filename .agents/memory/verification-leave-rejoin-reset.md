---
name: Verification re-verify blocked despite leaving server
description: Verified state was keyed only by user+guild+panel and never cleared on leave, so rejoining a server always hit "already verified".
---

The verification system (`artifacts/discord-bot/src/discord/verification/`) stores attempts keyed by guildId+panelId+userId in `data/verification.json` and never expired/cleared them. Intended behavior: a currently-joined verified member re-running verify should still be blocked ("already verified") — that part was correct. The bug was that leaving and rejoining kept the stale "verified" record, so a legitimate rejoin was also blocked.

Fix: added `clearAttemptsForUser(guildId, userId)` in `verification-store.ts` and `VerificationService.handleMemberLeave()`, wired into the existing `guildMemberRemove` listener in `src/index.ts` (alongside welcomeService/serverLogService leave handlers). On leave, all of that user's verification attempts in that guild are deleted, so a rejoin starts fresh while still-a-member re-verification stays blocked.

**Why:** distinguishing "still in server, already verified" (should block) from "left and rejoined" (should allow) requires hooking the leave event — there's no TTL or membership check in the original design.

**How to apply:** if verification (or any similar per-member state keyed by userId+guildId) needs to reset on rejoin, add a `guildMemberRemove` cleanup rather than changing the verify-time check itself.
